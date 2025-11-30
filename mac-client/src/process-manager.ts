import * as pty from "node-pty";
import os from "os";
import chalk from "chalk";

/**
 * Information about a single terminal process
 */
export interface ProcessInfo {
  uuid: string;
  pty: pty.IPty;
  screenBuffer: string;
  createdAt: number;
  cols: number;
  rows: number;
}

/**
 * Callback type for process output events
 */
export type ProcessOutputCallback = (uuid: string, data: string) => void;

/**
 * Callback type for process exit events
 */
export type ProcessExitCallback = (uuid: string) => void;

/**
 * ProcessManager - Mid-layer controller for managing multiple terminal processes
 * 
 * Responsibilities:
 * - Maintain a map of all processes keyed by UUID
 * - Track which processes are currently "active" (output forwarded to iOS)
 * - Route commands to specific processes
 * - Only forward output from active processes
 */
export class ProcessManager {
  private processMap: Map<string, ProcessInfo> = new Map();
  private activeProcesses: string[] = [];
  private outputCallback: ProcessOutputCallback | null = null;
  private exitCallback: ProcessExitCallback | null = null;

  /**
   * Set the callback for process output
   * Only output from active processes will trigger this callback
   */
  public onOutput(callback: ProcessOutputCallback): void {
    this.outputCallback = callback;
  }

  /**
   * Set the callback for process exit events
   */
  public onExit(callback: ProcessExitCallback): void {
    this.exitCallback = callback;
  }

  /**
   * Create a new terminal process
   * @param uuid - Unique identifier from iOS client
   * @param cols - Terminal columns
   * @param rows - Terminal rows
   * @returns The created ProcessInfo or null on failure
   */
  public createProcess(uuid: string, cols: number, rows: number): ProcessInfo | null {
    if (this.processMap.has(uuid)) {
      console.log(chalk.yellow(`⚠️  Process ${uuid} already exists`));
      return this.processMap.get(uuid) || null;
    }

    const shell = os.platform() === "win32" 
      ? "powershell.exe" 
      : process.env.SHELL || "bash";

    console.log(chalk.cyan(`\n🖥️  Creating process ${uuid.substring(0, 8)}... (${shell})`));

    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };

    try {
      const ptyProcess = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: process.env.HOME || process.cwd(),
        env: env as Record<string, string>,
      });

      const processInfo: ProcessInfo = {
        uuid,
        pty: ptyProcess,
        screenBuffer: "",
        createdAt: Date.now(),
        cols,
        rows,
      };

      this.processMap.set(uuid, processInfo);

      // Set up output handler
      ptyProcess.onData((data: string) => {
        // Always update the screen buffer
        processInfo.screenBuffer += data;
        // Limit buffer size to prevent memory issues (keep last 100KB)
        if (processInfo.screenBuffer.length > 100000) {
          processInfo.screenBuffer = processInfo.screenBuffer.slice(-50000);
        }

        // Only forward output if this process is active
        const isActive = this.isActive(uuid);
        if (isActive && this.outputCallback) {
          this.outputCallback(uuid, data);
        } else if (!isActive) {
          // Debug: log when output is suppressed
          console.log(chalk.gray(`🔇 Output suppressed for inactive process ${uuid.substring(0, 8)}`));
        }
      });

      // Set up exit handler
      ptyProcess.onExit(() => {
        console.log(chalk.gray(`Process ${uuid.substring(0, 8)} exited`));
        this.processMap.delete(uuid);
        this.activeProcesses = this.activeProcesses.filter(id => id !== uuid);
        if (this.exitCallback) {
          this.exitCallback(uuid);
        }
      });

      // Initialize with shell setup commands
      this.initializeProcess(processInfo);

      console.log(chalk.green(`✅ Process ${uuid.substring(0, 8)} created`));
      return processInfo;
    } catch (error) {
      console.error(chalk.red(`❌ Failed to create process ${uuid}:`), error);
      return null;
    }
  }

  /**
   * Initialize a process with shell setup commands
   */
  private initializeProcess(processInfo: ProcessInfo): void {
    const initCommands = [
      "setopt PROMPT_SUBST 2>/dev/null || true", // Enable dynamic command substitution in prompt (zsh)
      "export PS1='%F{cyan}%~%f %F{green}$(git branch --show-current 2>/dev/null)%f $ ' 2>/dev/null || export PS1='\\[\\033[36m\\]\\w\\[\\033[0m\\] $ '",
      "clear",
    ];

    // Send commands with a small delay to ensure shell is ready
    setTimeout(() => {
      initCommands.forEach(cmd => processInfo.pty.write(cmd + "\r"));
    }, 100);
  }

  /**
   * Terminate a process
   * @param uuid - Process UUID to terminate
   * @returns true if process was terminated, false if not found
   */
  public terminateProcess(uuid: string): boolean {
    const processInfo = this.processMap.get(uuid);
    if (!processInfo) {
      console.log(chalk.yellow(`⚠️  Process ${uuid} not found`));
      return false;
    }

    console.log(chalk.cyan(`🗑️  Terminating process ${uuid.substring(0, 8)}...`));

    try {
      processInfo.pty.kill();
      this.processMap.delete(uuid);
      this.activeProcesses = this.activeProcesses.filter(id => id !== uuid);
      console.log(chalk.green(`✅ Process ${uuid.substring(0, 8)} terminated`));
      return true;
    } catch (error) {
      console.error(chalk.red(`❌ Failed to terminate process ${uuid}:`), error);
      return false;
    }
  }

  /**
   * Switch active processes
   * Only processes in this list will have their output forwarded
   * @param uuids - Array of UUIDs to set as active
   * @returns Screen snapshots for the newly active processes
   */
  public switchActiveProcesses(uuids: string[]): Map<string, string> {
    console.log(chalk.cyan(`🔄 Switching active processes to: ${uuids.map(u => u.substring(0, 8)).join(", ")}`));
    
    // Update active list
    this.activeProcesses = uuids.filter(uuid => this.processMap.has(uuid));

    // Collect screen snapshots for newly active processes
    const snapshots = new Map<string, string>();
    for (const uuid of this.activeProcesses) {
      const processInfo = this.processMap.get(uuid);
      if (processInfo) {
        snapshots.set(uuid, processInfo.screenBuffer);
      }
    }

    return snapshots;
  }

  /**
   * Write input data to a specific process
   * @param uuid - Process UUID
   * @param data - Input data to write
   * @returns true if written successfully, false if process not found
   */
  public writeToProcess(uuid: string, data: string): boolean {
    const processInfo = this.processMap.get(uuid);
    if (!processInfo) {
      console.log(chalk.yellow(`⚠️  Cannot write to process ${uuid}: not found`));
      return false;
    }

    processInfo.pty.write(data);
    return true;
  }

  /**
   * Resize a specific process
   * @param uuid - Process UUID
   * @param cols - New column count
   * @param rows - New row count
   * @returns true if resized successfully, false if process not found
   */
  public resizeProcess(uuid: string, cols: number, rows: number): boolean {
    const processInfo = this.processMap.get(uuid);
    if (!processInfo) {
      return false;
    }

    processInfo.pty.resize(cols, rows);
    processInfo.cols = cols;
    processInfo.rows = rows;
    return true;
  }

  /**
   * Resize all processes
   * @param cols - New column count
   * @param rows - New row count
   */
  public resizeAll(cols: number, rows: number): void {
    for (const [uuid] of this.processMap) {
      this.resizeProcess(uuid, cols, rows);
    }
  }

  /**
   * Check if a process is in the active list
   */
  public isActive(uuid: string): boolean {
    return this.activeProcesses.includes(uuid);
  }

  /**
   * Get a process by UUID
   */
  public getProcess(uuid: string): ProcessInfo | undefined {
    return this.processMap.get(uuid);
  }

  /**
   * Get all process UUIDs
   */
  public getAllProcessIds(): string[] {
    return Array.from(this.processMap.keys());
  }

  /**
   * Get active process UUIDs
   */
  public getActiveProcessIds(): string[] {
    return [...this.activeProcesses];
  }

  /**
   * Get the first active process (for AI service compatibility)
   */
  public getFirstActiveProcess(): ProcessInfo | undefined {
    if (this.activeProcesses.length > 0) {
      return this.processMap.get(this.activeProcesses[0]);
    }
    return undefined;
  }

  /**
   * Get total process count
   */
  public getProcessCount(): number {
    return this.processMap.size;
  }

  /**
   * Clean up all processes
   */
  public cleanup(): void {
    console.log(chalk.yellow("🧹 Cleaning up all processes..."));
    for (const [uuid, processInfo] of this.processMap) {
      try {
        processInfo.pty.kill();
        console.log(chalk.gray(`  Killed process ${uuid.substring(0, 8)}`));
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    this.processMap.clear();
    this.activeProcesses = [];
    console.log(chalk.green("✅ All processes cleaned up"));
  }
}

