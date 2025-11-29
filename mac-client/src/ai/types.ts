/**
 * AI Types for Claude Terminal Actions
 *
 * These types define the structure of actions that Claude can generate
 * to interact with the terminal.
 */

/** Action type literals */
export type ActionType = "keystroke" | "delay" | "request_screen" | "message";

/** Base action interface */
interface BaseAction {
  type: ActionType;
}

/** Keystroke action - sends a key or string to the terminal */
export interface KeystrokeAction extends BaseAction {
  type: "keystroke";
  value: string;
}

/** Delay action - waits for a specified number of milliseconds */
export interface DelayAction extends BaseAction {
  type: "delay";
  value: number;
}

/** Options for request_screen action - allows slicing the screen buffer */
export interface RequestScreenOptions {
  /** Start index for the slice (0-based, from beginning of buffer) */
  sliceStart?: number;
  /** End index for the slice (exclusive, like string.slice()) */
  sliceEnd?: number;
}

/** Request screen action - captures current terminal state for the next Claude turn */
export interface RequestScreenAction extends BaseAction {
  type: "request_screen";
  value: RequestScreenOptions | null;
}

/** Metadata about the screen slice being returned */
export interface ScreenSliceMetadata {
  /** Actual start index of the returned slice */
  sliceStart: number;
  /** Actual end index of the returned slice */
  sliceEnd: number;
  /** Total length of the screen buffer */
  totalLength: number;
  /** Unique ID that changes when screen content changes */
  screenId: string;
}

/** Message action - displays a message/explanation to the user */
export interface MessageAction extends BaseAction {
  type: "message";
  value: string;
}

/** Union type of all possible actions */
export type AIAction = KeystrokeAction | DelayAction | RequestScreenAction | MessageAction;

/** Claude's response format */
export interface ClaudeResponse {
  actions: AIAction[];
  thinking?: string;
}

/** Message in the conversation context */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/** Full conversation context for Claude */
export interface AIConversationContext {
  systemPrompt: string;
  messages: ConversationMessage[];
}

/** AI prompt payload from mobile */
export interface AIPromptPayload {
  prompt: string;
}

/** Terminal screen snapshot */
export interface TerminalSnapshot {
  content: string;
  timestamp: number;
  cols: number;
  rows: number;
  /** Metadata about the slice */
  metadata: ScreenSliceMetadata;
}

/** AI Service callbacks */
export interface AIServiceCallbacks {
  onActionStart?: (action: AIAction) => void;
  onActionComplete?: (action: AIAction) => void;
  onTurnComplete?: (turnNumber: number) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

