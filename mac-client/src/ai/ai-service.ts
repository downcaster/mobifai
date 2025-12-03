/**
 * AI Service for Claude Terminal Interaction
 *
 * Handles the multi-turn ping-pong flow between Claude and the terminal,
 * managing context and executing actions.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as pty from "node-pty";
import chalk from "chalk";
import { config } from "../config.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { executeActions, hasScreenRequest } from "./action-executor.js";
import { v4 as uuidv4 } from "uuid";
import type {
  AIAction,
  ClaudeResponse,
  ConversationMessage,
  AIServiceCallbacks,
  TerminalSnapshot,
  RequestScreenAction,
  RequestScreenOptions,
  ScreenSliceMetadata,
} from "./types.js";

/** Maximum number of turns to prevent infinite loops */
const MAX_TURNS = 20;

/** Delay after capturing screen to let terminal settle */
const SCREEN_CAPTURE_DELAY = 300;

/** Default slice size for initial screen capture (15k chars) */
const DEFAULT_INITIAL_SLICE_SIZE = 15000;

/** Maximum buffer size to keep in memory */
const MAX_BUFFER_SIZE = 100000;

/** Maximum conversation history messages to keep (to prevent unbounded growth) */
const MAX_CONVERSATION_HISTORY = 20;

/**
 * AI Service class that manages Claude interactions
 */
export class AIService {
  private anthropic: Anthropic;
  private terminal: pty.IPty | null = null;
  private latestScreenSnapshot: TerminalSnapshot | null = null;
  private screenBuffer: string = "";
  private screenId: string = uuidv4();
  private isProcessing: boolean = false;
  private cols: number = 80;
  private rows: number = 30;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: config.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Set the terminal instance for action execution
   */
  setTerminal(terminal: pty.IPty): void {
    this.terminal = terminal;
  }

  /**
   * Set terminal dimensions
   */
  setDimensions(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
  }

  /**
   * Update the screen buffer with new terminal output
   * Called whenever terminal output is received
   * Updates screenId if content actually changes
   */
  updateScreenBuffer(data: string): void {
    if (!data) return;

    const previousBuffer = this.screenBuffer;
    
    // Append new data to buffer
    this.screenBuffer += data;

    // Keep buffer at reasonable size
    if (this.screenBuffer.length > MAX_BUFFER_SIZE) {
      this.screenBuffer = this.screenBuffer.slice(-MAX_BUFFER_SIZE);
    }

    // Update screenId if the buffer content actually changed
    if (this.screenBuffer !== previousBuffer) {
      this.screenId = uuidv4();
    }
  }

  /**
   * Capture the current terminal screen snapshot with slice options
   * @param options - Optional slice parameters (sliceStart, sliceEnd)
   * @param useDefaultSlice - If true and no options provided, use last DEFAULT_INITIAL_SLICE_SIZE chars
   */
  private captureScreen(options?: RequestScreenOptions, useDefaultSlice: boolean = false): TerminalSnapshot {
    const totalLength = this.screenBuffer.length;
    let sliceStart: number;
    let sliceEnd: number;
    let screenContent: string;

    if (options?.sliceStart !== undefined || options?.sliceEnd !== undefined) {
      // Use explicit slice parameters
      sliceStart = Math.max(0, options.sliceStart ?? 0);
      sliceEnd = Math.min(totalLength, options.sliceEnd ?? totalLength);
      screenContent = this.screenBuffer.slice(sliceStart, sliceEnd);
      console.log(
        chalk.gray(`  📏 Screen slice [${sliceStart}:${sliceEnd}] of ${totalLength} total chars`)
      );
    } else if (useDefaultSlice && totalLength > DEFAULT_INITIAL_SLICE_SIZE) {
      // Default: get last DEFAULT_INITIAL_SLICE_SIZE chars for initial capture
      sliceStart = totalLength - DEFAULT_INITIAL_SLICE_SIZE;
      sliceEnd = totalLength;
      screenContent = this.screenBuffer.slice(sliceStart, sliceEnd);
      console.log(
        chalk.gray(`  📏 Screen slice (default) [${sliceStart}:${sliceEnd}] of ${totalLength} total chars`)
      );
    } else {
      // Full buffer
      sliceStart = 0;
      sliceEnd = totalLength;
      screenContent = this.screenBuffer;
      console.log(
        chalk.gray(`  📏 Full screen buffer: ${totalLength} chars`)
      );
    }

    const metadata: ScreenSliceMetadata = {
      sliceStart,
      sliceEnd,
      totalLength,
      screenId: this.screenId,
    };

    const snapshot: TerminalSnapshot = {
      content: screenContent,
      timestamp: Date.now(),
      cols: this.cols,
      rows: this.rows,
      metadata,
    };

    this.latestScreenSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Get the latest screen snapshot
   */
  getLatestScreen(): TerminalSnapshot | null {
    return this.latestScreenSnapshot;
  }

  /**
   * Check if AI is currently processing
   */
  isActive(): boolean {
    return this.isProcessing;
  }

  /**
   * Parse Claude's response to extract actions
   */
  private parseClaudeResponse(responseText: string): ClaudeResponse {
    try {
      let jsonStr = responseText.trim();

      // Try to extract JSON from the response using multiple strategies
      
      // Strategy 1: Remove markdown code block if present
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }

      // Strategy 2: If the response doesn't start with {, try to find JSON object in the text
      if (!jsonStr.startsWith("{")) {
        // Look for a JSON object pattern in the text
        const jsonObjectMatch = jsonStr.match(/\{[\s\S]*"actions"[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
          console.log(
            chalk.yellow("⚠️  Extracted JSON from mixed response (text + JSON)")
          );
        }
      }

      const parsed = JSON.parse(jsonStr);

      // Validate the response structure
      if (!parsed.actions || !Array.isArray(parsed.actions)) {
        throw new Error("Response missing 'actions' array");
      }

      // Validate each action
      for (const action of parsed.actions) {
        if (!action.type) {
          throw new Error("Action missing 'type' field");
        }
        if (
          action.type !== "keystroke" &&
          action.type !== "delay" &&
          action.type !== "request_screen" &&
          action.type !== "message"
        ) {
          throw new Error(`Invalid action type: ${action.type}`);
        }
        if (action.type === "keystroke" && typeof action.value !== "string") {
          throw new Error("Keystroke action requires string value");
        }
        if (action.type === "delay" && typeof action.value !== "number") {
          throw new Error("Delay action requires number value");
        }
        if (action.type === "message" && typeof action.value !== "string") {
          throw new Error("Message action requires string value");
        }
      }

      return parsed as ClaudeResponse;
    } catch (error) {
      console.error(chalk.red("Failed to parse Claude response:"), error);
      console.error(chalk.gray("Raw response:"), responseText);
      throw new Error(`Failed to parse Claude response: ${error}`);
    }
  }

  /**
   * Send a request to Claude and get the response
   */
  private async sendToClaude(
    messages: ConversationMessage[]
  ): Promise<ClaudeResponse> {
    console.log(chalk.cyan("\n📤 Sending request to Claude..."));

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    console.log(chalk.green("✅ Received response from Claude"));

    return this.parseClaudeResponse(textContent.text);
  }

  /**
   * Format the terminal screen for Claude with metadata
   */
  private formatScreenForClaude(screen: TerminalSnapshot): string {
    const meta = screen.metadata;
    const isFullScreen = meta.sliceStart === 0 && meta.sliceEnd === meta.totalLength;
    const sliceInfo = isFullScreen 
      ? `Full buffer (${meta.totalLength} chars)` 
      : `Slice [${meta.sliceStart}:${meta.sliceEnd}] of ${meta.totalLength} total chars`;
    
    return `Terminal Screen (${screen.cols}x${screen.rows})
Screen Info: { sliceStart: ${meta.sliceStart}, sliceEnd: ${meta.sliceEnd}, totalLength: ${meta.totalLength}, screenId: "${meta.screenId}" }
Note: ${sliceInfo}${!isFullScreen ? ` - Request different slice range if you need other parts of the buffer` : ""}

\`\`\`
${screen.content}
\`\`\``;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Trim conversation history to prevent unbounded growth
   */
  private trimConversationHistory(history: ConversationMessage[]): ConversationMessage[] {
    if (history.length <= MAX_CONVERSATION_HISTORY) {
      return history;
    }

    console.log(chalk.yellow(`⚠️  Trimming conversation history from ${history.length} to ${MAX_CONVERSATION_HISTORY} messages`));
    
    // Keep the first message (user prompt) and the most recent messages
    const firstMessage = history[0];
    const recentMessages = history.slice(-(MAX_CONVERSATION_HISTORY - 1));
    
    return [firstMessage, ...recentMessages];
  }

  /**
   * Clean up old screen buffer data periodically
   */
  private cleanupScreenBuffer(): void {
    if (this.screenBuffer.length > MAX_BUFFER_SIZE) {
      const oldLength = this.screenBuffer.length;
      this.screenBuffer = this.screenBuffer.slice(-MAX_BUFFER_SIZE);
      console.log(chalk.gray(`🧹 Cleaned screen buffer: ${oldLength} -> ${this.screenBuffer.length} chars`));
    }
  }

  /**
   * Handle an AI prompt from the mobile client
   * This is the main entry point for AI interactions
   */
  async handlePrompt(
    prompt: string,
    callbacks?: AIServiceCallbacks
  ): Promise<void> {
    if (!this.terminal) {
      const error = new Error("Terminal not initialized");
      callbacks?.onError?.(error);
      throw error;
    }

    if (this.isProcessing) {
      console.log(chalk.yellow("⚠️  AI is already processing a request"));
      return;
    }

    this.isProcessing = true;
    console.log(chalk.bold.cyan("\n🤖 Starting AI interaction"));
    console.log(chalk.gray(`Prompt: "${prompt}"`));

    try {
      // Clean up screen buffer before starting
      this.cleanupScreenBuffer();
      
      // Build initial context
      const conversationHistory: ConversationMessage[] = [];

      // Capture initial screen with default slice (last 15k chars)
      await this.sleep(SCREEN_CAPTURE_DELAY);
      const initialScreen = this.captureScreen(undefined, true);

      // Add initial user message with prompt and screen
      conversationHistory.push({
        role: "user",
        content: `User Request: ${prompt}

${this.formatScreenForClaude(initialScreen)}`,
      });

      let turnNumber = 0;

      // Multi-turn loop
      while (turnNumber < MAX_TURNS) {
        turnNumber++;
        console.log(chalk.bold.yellow(`\n--- Turn ${turnNumber} ---`));

        // Send to Claude
        const claudeResponse = await this.sendToClaude(conversationHistory);

        // Check if we're done (empty actions array)
        if (claudeResponse.actions.length === 0) {
          console.log(chalk.bold.green("\n✅ AI completed - no more actions"));
          callbacks?.onComplete?.();
          break;
        }

        // Log the actions
        console.log(
          chalk.cyan(`Claude returned ${claudeResponse.actions.length} actions`)
        );

        // Add Claude's response to history
        conversationHistory.push({
          role: "assistant",
          content: JSON.stringify(claudeResponse),
        });

        // Trim conversation history to prevent unbounded growth
        if (conversationHistory.length > MAX_CONVERSATION_HISTORY) {
          const trimmed = this.trimConversationHistory(conversationHistory);
          conversationHistory.length = 0;
          conversationHistory.push(...trimmed);
        }

        // Execute the actions
        await executeActions(
          claudeResponse.actions,
          this.terminal,
          callbacks
        );

        callbacks?.onTurnComplete?.(turnNumber);

        // Check if the LAST action is a screen request - only then continue the loop
        const lastAction = claudeResponse.actions[claudeResponse.actions.length - 1];
        const screenRequested = lastAction?.type === "request_screen";

        // If screen was requested as final action, capture and continue
        if (screenRequested) {
          // Wait for terminal to update
          await this.sleep(SCREEN_CAPTURE_DELAY);

          // Extract slice options from the request_screen action
          const screenAction = lastAction as RequestScreenAction;
          const sliceOptions = screenAction.value ?? undefined;

          // Capture new screen with slice options (or default slice if no options)
          const newScreen = this.captureScreen(sliceOptions, true);

          // Add to conversation as user message
          conversationHistory.push({
            role: "user",
            content: this.formatScreenForClaude(newScreen),
          });

          console.log(chalk.magenta(`📸 Screen captured (screenId: ${newScreen.metadata.screenId.slice(0, 8)}...), continuing loop`));
        } else {
          // No screen request as final action - task is complete
          console.log(chalk.green("✅ Actions executed - no screen request at end, task complete"));
          callbacks?.onComplete?.();
          break;
        }
      }

      if (turnNumber >= MAX_TURNS) {
        console.log(
          chalk.yellow(`⚠️  Reached maximum turns (${MAX_TURNS}), stopping`)
        );
        callbacks?.onComplete?.();
      }
    } catch (error) {
      console.error(chalk.red("\n❌ AI interaction failed:"), error);
      callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.isProcessing = false;
      
      // Clean up screen buffer after interaction
      this.cleanupScreenBuffer();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }
}

/** Singleton instance */
let aiServiceInstance: AIService | null = null;

/**
 * Get the AI service singleton instance
 */
export function getAIService(): AIService {
  if (!aiServiceInstance) {
    aiServiceInstance = new AIService();
  }
  return aiServiceInstance;
}

