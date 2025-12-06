import * as pty from "node-pty";
import os from "os";
import chalk from "chalk";
import fs from "fs";
import { execSync } from "child_process";
import { getPrismaClient } from "./db.js";

/**
 * Information about a single terminal process
 */
export interface ProcessInfo {
  uuid: string;
  name: string;
  pty: pty.IPty;
  screenBuffer: string;
  createdAt: number;
  cols: number;
  rows: number;
  cwd: string;
}

/**
 * Sync data for a process (sent to iOS on reconnection)
 */
export interface ProcessSyncData {
  uuid: string;
  name: string;
  createdAt: number;
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
 * Check if a process with given PID exists
 */
function isPidRunning(pid: number): boolean {
  try {
    // Sending signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * ProcessManager - Mid-layer controller for managing multiple terminal processes
 *
 * Responsibilities:
 * - Maintain a map of all processes keyed by UUID
 * - Track which processes are currently "active" (output forwarded to iOS)
 * - Route commands to specific processes
 * - Only forward output from active processes
 * - Persist process state to SQLite via Prisma
 */
export class ProcessManager {
  private processMap: Map<string, ProcessInfo> = new Map();
  private activeProcesses: string[] = [];
  private outputCallback: ProcessOutputCallback | null = null;
  private exitCallback: ProcessExitCallback | null = null;
  private lastMemoryCheck: number = Date.now();
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  /**
   * Initialize the process manager - load persisted processes
   * Returns array of processes that should be restored
   */
  public async initialize(): Promise<Array<{
    uuid: string;
    name: string;
    cwd: string;
    isActive: boolean;
  }>> {
    if (this.initialized) return [];
    
    console.log(chalk.cyan("🔄 Initializing ProcessManager..."));
    
    const processesToRestore: Array<{
      uuid: string;
      name: string;
      cwd: string;
      isActive: boolean;
    }> = [];
    
    try {
      const prisma = getPrismaClient();
      const savedProcesses = await prisma.terminalProcess.findMany({
        orderBy: { createdAt: 'asc' },
      });
      
      console.log(chalk.gray(`  Found ${savedProcesses.length} saved process(es) in DB`));
      
      for (const saved of savedProcesses) {
        console.log(chalk.cyan(`  📋 Restoring tab: "${saved.name}" (was at ${saved.cwd})`));
        
        // Add to restoration list
        processesToRestore.push({
          uuid: saved.uuid,
          name: saved.name,
          cwd: saved.cwd,
          isActive: saved.isActive,
        });
      }
      
      // Clear all from DB - we'll recreate them as new processes
      await prisma.terminalProcess.deleteMany();
      
      this.initialized = true;
      console.log(chalk.green(`✅ ProcessManager initialized - ${processesToRestore.length} tab(s) to restore`));
      return processesToRestore;
    } catch (error) {
      console.error(chalk.red("❌ Failed to initialize ProcessManager:"), error);
      this.initialized = true; // Mark as initialized to prevent retry loops
      return [];
    }
  }

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
   * @param name - Optional display name for the tab
   * @returns The created ProcessInfo or null on failure
   */
  public async createProcess(
    uuid: string,
    cols: number,
    rows: number,
    name?: string
  ): Promise<ProcessInfo | null> {
    if (this.processMap.has(uuid)) {
      console.log(chalk.yellow(`⚠️  Process ${uuid} already exists`));
      return this.processMap.get(uuid) || null;
    }

    const shell =
      os.platform() === "win32"
        ? "powershell.exe"
        : process.env.SHELL || "bash";

    // Generate default name if not provided
    const processName = name || `Tab ${this.processMap.size + 1}`;

    console.log(
      chalk.cyan(
        `\n🖥️  Creating process ${uuid.substring(
          0,
          8
        )} "${processName}"... (${shell})`
      )
    );

    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };

    const initialCwd = process.env.HOME || process.cwd();

    try {
      const ptyProcess = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: initialCwd,
        env: env as Record<string, string>,
      });

      const processInfo: ProcessInfo = {
        uuid,
        name: processName,
        pty: ptyProcess,
        screenBuffer: "",
        createdAt: Date.now(),
        cols,
        rows,
        cwd: initialCwd,
      };

      this.processMap.set(uuid, processInfo);

      // Persist to database
      try {
        const prisma = getPrismaClient();
        await prisma.terminalProcess.create({
          data: {
            uuid,
            name: processName,
            pid: ptyProcess.pid,
            cwd: initialCwd,
            isActive: false,
            createdAt: new Date(processInfo.createdAt),
          },
        });
        console.log(chalk.gray(`  💾 Persisted process to DB`));
      } catch (dbError) {
        console.error(chalk.yellow(`  ⚠️ Failed to persist process to DB:`), dbError);
      }

      // Set up output handler - store reference for cleanup
      const onDataHandler = (data: string) => {
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
          // Debug: log when output is suppressed (rate-limited)
          if (Math.random() < 0.01) {
            // Only log 1% of the time to avoid spam
            console.log(
              chalk.gray(
                `🔇 Output suppressed for inactive process ${uuid.substring(
                  0,
                  8
                )}`
              )
            );
          }
        }
      };

      ptyProcess.onData(onDataHandler);

      // Set up exit handler
      ptyProcess.onExit(() => {
        console.log(chalk.gray(`Process ${uuid.substring(0, 8)} exited`));
        this.handleProcessExit(uuid);
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
   * Handle process exit - cleanup and remove from DB
   */
  private async handleProcessExit(uuid: string): Promise<void> {
    this.processMap.delete(uuid);
    this.activeProcesses = this.activeProcesses.filter((id) => id !== uuid);
    
    // Remove from database
    try {
      const prisma = getPrismaClient();
      await prisma.terminalProcess.deleteMany({ where: { uuid } });
      console.log(chalk.gray(`  💾 Removed process from DB`));
    } catch (dbError) {
      console.error(chalk.yellow(`  ⚠️ Failed to remove process from DB:`), dbError);
    }
    
    if (this.exitCallback) {
      this.exitCallback(uuid);
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
      initCommands.forEach((cmd) => processInfo.pty.write(cmd + "\r"));
    }, 100);
  }

  /**
   * Terminate a process
   * @param uuid - Process UUID to terminate
   * @returns true if process was terminated, false if not found
   */
  public async terminateProcess(uuid: string): Promise<boolean> {
    const processInfo = this.processMap.get(uuid);
    if (!processInfo) {
      console.log(chalk.yellow(`⚠️  Process ${uuid} not found`));
      return false;
    }

    console.log(
      chalk.cyan(`🗑️  Terminating process ${uuid.substring(0, 8)}...`)
    );

    try {
      processInfo.pty.kill();
      this.processMap.delete(uuid);
      this.activeProcesses = this.activeProcesses.filter((id) => id !== uuid);
      
      // Remove from database
      try {
        const prisma = getPrismaClient();
        await prisma.terminalProcess.deleteMany({ where: { uuid } });
        console.log(chalk.gray(`  💾 Removed process from DB`));
      } catch (dbError) {
        console.error(chalk.yellow(`  ⚠️ Failed to remove process from DB:`), dbError);
      }
      
      console.log(chalk.green(`✅ Process ${uuid.substring(0, 8)} terminated`));
      return true;
    } catch (error) {
      console.error(
        chalk.red(`❌ Failed to terminate process ${uuid}:`),
        error
      );
      return false;
    }
  }

  /**
   * Switch active processes
   * Only processes in this list will have their output forwarded
   * @param uuids - Array of UUIDs to set as active
   * @returns Screen snapshots for the newly active processes
   */
  public async switchActiveProcesses(uuids: string[]): Promise<Map<string, string>> {
    console.log(
      chalk.cyan(
        `🔄 Switching active processes to: ${uuids
          .map((u) => u.substring(0, 8))
          .join(", ")}`
      )
    );

    // Update active list
    this.activeProcesses = uuids.filter((uuid) => this.processMap.has(uuid));

    // Update active status in database
    try {
      const prisma = getPrismaClient();
      // Set all to inactive first
      await prisma.terminalProcess.updateMany({
        data: { isActive: false },
      });
      // Set active ones
      if (this.activeProcesses.length > 0) {
        await prisma.terminalProcess.updateMany({
          where: { uuid: { in: this.activeProcesses } },
          data: { isActive: true },
        });
      }
    } catch (dbError) {
      console.error(chalk.yellow(`  ⚠️ Failed to update active status in DB:`), dbError);
    }

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
      console.log(
        chalk.yellow(`⚠️  Cannot write to process ${uuid}: not found`)
      );
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
    const processInfo = this.processMap.get(uuid);
    if (processInfo) {
      // Try to update the cwd from the actual process
      const currentCwd = this.getProcessCwd(processInfo);
      if (currentCwd) {
        processInfo.cwd = currentCwd;
      }
    }
    return processInfo;
  }

  /**
   * Get the current working directory of a process
   * Uses platform-specific methods to read the actual cwd
   */
  private getProcessCwd(processInfo: ProcessInfo): string | null {
    const pid = processInfo.pty.pid;
    if (!pid) return null;

    try {
      if (os.platform() === "darwin") {
        // macOS: use lsof to get cwd
        const result = execSync(
          `lsof -p ${pid} | grep cwd | awk '{print $NF}'`,
          {
            encoding: "utf-8",
            timeout: 1000,
          }
        ).trim();
        return result || null;
      } else if (os.platform() === "linux") {
        // Linux: use /proc/{pid}/cwd
        const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
        return cwd;
      }
    } catch (error) {
      // Failed to get cwd, return stored cwd
      console.log(
        chalk.gray(`Could not read cwd for pid ${pid}, using stored value`)
      );
    }
    return processInfo.cwd;
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
   * Get sync data for all processes (for sending to iOS on reconnection)
   */
  public getProcessSyncData(): ProcessSyncData[] {
    const syncData: ProcessSyncData[] = [];
    for (const [uuid, processInfo] of this.processMap) {
      syncData.push({
        uuid,
        name: processInfo.name,
        createdAt: processInfo.createdAt,
      });
    }
    // Sort by creation time
    syncData.sort((a, b) => a.createdAt - b.createdAt);
    return syncData;
  }

  /**
   * Rename a process
   * @param uuid - Process UUID
   * @param name - New name for the process
   * @returns true if renamed successfully, false if process not found
   */
  public async renameProcess(uuid: string, name: string): Promise<boolean> {
    const processInfo = this.processMap.get(uuid);
    if (!processInfo) {
      console.log(chalk.yellow(`⚠️  Cannot rename process ${uuid}: not found`));
      return false;
    }

    console.log(
      chalk.cyan(`📝 Renaming process ${uuid.substring(0, 8)} to "${name}"`)
    );
    processInfo.name = name;

    // Update in database
    try {
      const prisma = getPrismaClient();
      await prisma.terminalProcess.updateMany({
        where: { uuid },
        data: { name },
      });
    } catch (dbError) {
      console.error(chalk.yellow(`  ⚠️ Failed to update name in DB:`), dbError);
    }

    return true;
  }

  /**
   * Start periodic memory health checks
   */
  public startMemoryMonitoring(): void {
    // Check memory every 5 minutes
    this.memoryCheckInterval = setInterval(() => {
      this.performMemoryCleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Perform memory cleanup on inactive processes
   */
  private performMemoryCleanup(): void {
    const now = Date.now();
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

    console.log(
      chalk.gray(`\n🧹 Memory check: ${heapUsedMB}MB / ${heapTotalMB}MB`)
    );

    // Clear screen buffers for inactive processes to save memory
    let buffersCleared = 0;
    for (const [uuid, processInfo] of this.processMap) {
      if (!this.isActive(uuid) && processInfo.screenBuffer.length > 0) {
        // Keep only last 10KB for inactive processes
        if (processInfo.screenBuffer.length > 10000) {
          processInfo.screenBuffer = processInfo.screenBuffer.slice(-10000);
          buffersCleared++;
        }
      }
    }

    if (buffersCleared > 0) {
      console.log(
        chalk.gray(
          `   Cleared buffers for ${buffersCleared} inactive process(es)`
        )
      );
    }

    // Force garbage collection if available
    if (global.gc) {
      console.log(chalk.gray("   Running garbage collection..."));
      global.gc();
    }

    this.lastMemoryCheck = now;
  }

  /**
   * Get memory usage statistics
   */
  public getMemoryStats(): {
    heapUsedMB: number;
    heapTotalMB: number;
    processCount: number;
    totalBufferSize: number;
  } {
    const memUsage = process.memoryUsage();
    let totalBufferSize = 0;

    for (const [_, processInfo] of this.processMap) {
      totalBufferSize += processInfo.screenBuffer.length;
    }

    return {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      processCount: this.processMap.size,
      totalBufferSize,
    };
  }

  /**
   * Clean up all processes (but don't kill them - let them run)
   * This is called on graceful shutdown
   */
  public cleanup(): void {
    console.log(chalk.yellow("🧹 Cleaning up ProcessManager..."));

    // Stop memory monitoring
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }

    // Note: We don't kill processes anymore - they will be cleaned up
    // from the DB on next startup if their PIDs are no longer running
    
    // Just clear our local state
    this.processMap.clear();
    this.activeProcesses = [];

    // Clear callbacks
    this.outputCallback = null;
    this.exitCallback = null;

    console.log(chalk.green("✅ ProcessManager cleaned up (processes left running)"));
  }

  /**
   * Force terminate all processes (for hard shutdown)
   */
  public forceCleanup(): void {
    console.log(chalk.yellow("🧹 Force cleaning up all processes..."));

    // Stop memory monitoring
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }

    for (const [uuid, processInfo] of this.processMap) {
      try {
        // Clear buffer first to free memory
        processInfo.screenBuffer = "";

        // Kill the PTY process
        processInfo.pty.kill();
        console.log(chalk.gray(`  Killed process ${uuid.substring(0, 8)}`));
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    this.processMap.clear();
    this.activeProcesses = [];

    // Clear callbacks
    this.outputCallback = null;
    this.exitCallback = null;

    console.log(chalk.green("✅ All processes force cleaned up"));
  }
}
