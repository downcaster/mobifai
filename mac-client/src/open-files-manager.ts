import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { getPrismaClient } from "./db.js";

/**
 * Callback type for file update events
 */
export type FileUpdateCallback = (filePath: string, content: string) => void;

/**
 * Information about an open file
 */
export interface OpenFileInfo {
  projectPath: string;
  filePath: string;
  isActive: boolean;
  watcher?: fs.FSWatcher;
}

/**
 * State of open files for a project (sent to iOS on reconnection)
 */
export interface ProjectOpenFilesState {
  projectPath: string;
  openFiles: string[];
  activeFile: string | null;
}

/**
 * OpenFilesManager - Manages open code files and watches for changes
 *
 * Responsibilities:
 * - Track which files are open for each project
 * - Watch files for changes and notify iOS
 * - Persist open file state to SQLite via Prisma
 * - Sync state with iOS on reconnection
 */
export class OpenFilesManager {
  private openFiles: Map<string, OpenFileInfo> = new Map();
  private fileUpdateCallback: FileUpdateCallback | null = null;
  private initialized: boolean = false;

  /**
   * Set the callback for file update events
   */
  public onFileUpdate(callback: FileUpdateCallback): void {
    this.fileUpdateCallback = callback;
  }

  /**
   * Initialize the manager - load persisted files
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log(chalk.cyan("🔄 Initializing OpenFilesManager..."));

    try {
      const prisma = getPrismaClient();
      const savedFiles = await prisma.openFile.findMany();

      console.log(chalk.gray(`  Found ${savedFiles.length} saved open file(s) in DB`));

      for (const saved of savedFiles) {
        // Check if file still exists
        if (fs.existsSync(saved.filePath)) {
          // Re-add to our in-memory map (without watcher for now)
          this.openFiles.set(saved.filePath, {
            projectPath: saved.projectPath,
            filePath: saved.filePath,
            isActive: saved.isActive,
          });
          console.log(chalk.gray(`  ✓ Restored: ${path.basename(saved.filePath)}`));
        } else {
          console.log(chalk.yellow(`  ⚠️ File not found, removing: ${saved.filePath}`));
          await prisma.openFile.delete({ where: { id: saved.id } });
        }
      }

      this.initialized = true;
      console.log(chalk.green("✅ OpenFilesManager initialized"));
    } catch (error) {
      console.error(chalk.red("❌ Failed to initialize OpenFilesManager:"), error);
      this.initialized = true; // Mark as initialized to prevent retry loops
    }
  }

  /**
   * Open a file (add to open files list)
   */
  public async openFile(projectPath: string, filePath: string): Promise<string | null> {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(chalk.yellow(`⚠️ File not found: ${filePath}`));
      return null;
    }

    // Read file content
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch (error) {
      console.error(chalk.red(`❌ Failed to read file: ${filePath}`), error);
      return null;
    }

    // Check if already open
    if (this.openFiles.has(filePath)) {
      console.log(chalk.gray(`File already open: ${path.basename(filePath)}`));
      return content;
    }

    console.log(chalk.cyan(`📂 Opening file: ${path.basename(filePath)}`));

    // Add to open files
    const fileInfo: OpenFileInfo = {
      projectPath,
      filePath,
      isActive: false,
    };

    this.openFiles.set(filePath, fileInfo);

    // Persist to database
    try {
      const prisma = getPrismaClient();
      await prisma.openFile.upsert({
        where: {
          projectPath_filePath: { projectPath, filePath },
        },
        update: {},
        create: {
          projectPath,
          filePath,
          isActive: false,
        },
      });
      console.log(chalk.gray(`  💾 Persisted to DB`));
    } catch (dbError) {
      console.error(chalk.yellow(`  ⚠️ Failed to persist to DB:`), dbError);
    }

    return content;
  }

  /**
   * Close a file (remove from open files list)
   */
  public async closeFile(filePath: string): Promise<boolean> {
    const fileInfo = this.openFiles.get(filePath);
    if (!fileInfo) {
      console.log(chalk.yellow(`⚠️ File not open: ${filePath}`));
      return false;
    }

    console.log(chalk.cyan(`📁 Closing file: ${path.basename(filePath)}`));

    // Stop watching
    if (fileInfo.watcher) {
      fileInfo.watcher.close();
    }

    // Remove from open files
    this.openFiles.delete(filePath);

    // Remove from database
    try {
      const prisma = getPrismaClient();
      await prisma.openFile.deleteMany({
        where: { filePath },
      });
      console.log(chalk.gray(`  💾 Removed from DB`));
    } catch (dbError) {
      console.error(chalk.yellow(`  ⚠️ Failed to remove from DB:`), dbError);
    }

    return true;
  }

  /**
   * Set the active file and start watching it
   */
  public async setActiveFile(filePath: string | null): Promise<string | null> {
    // Stop watching previous active file
    for (const [path, fileInfo] of this.openFiles) {
      if (fileInfo.isActive && path !== filePath) {
        if (fileInfo.watcher) {
          fileInfo.watcher.close();
          fileInfo.watcher = undefined;
        }
        fileInfo.isActive = false;
      }
    }

    // Update database - set all to inactive first
    try {
      const prisma = getPrismaClient();
      await prisma.openFile.updateMany({
        data: { isActive: false },
      });
    } catch (dbError) {
      console.error(chalk.yellow(`⚠️ Failed to update active status in DB:`), dbError);
    }

    if (!filePath) {
      return null;
    }

    const fileInfo = this.openFiles.get(filePath);
    if (!fileInfo) {
      console.log(chalk.yellow(`⚠️ File not open: ${filePath}`));
      return null;
    }

    console.log(chalk.cyan(`👁️ Setting active file: ${path.basename(filePath)}`));

    // Mark as active
    fileInfo.isActive = true;

    // Start watching for changes
    this.startWatching(fileInfo);

    // Update in database
    try {
      const prisma = getPrismaClient();
      await prisma.openFile.updateMany({
        where: { filePath },
        data: { isActive: true },
      });
    } catch (dbError) {
      console.error(chalk.yellow(`  ⚠️ Failed to update active status in DB:`), dbError);
    }

    // Read and return current content
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch (error) {
      console.error(chalk.red(`❌ Failed to read active file: ${filePath}`), error);
      return null;
    }
  }

  /**
   * Start watching a file for changes
   */
  private startWatching(fileInfo: OpenFileInfo): void {
    if (fileInfo.watcher) {
      return; // Already watching
    }

    try {
      let lastContent = fs.readFileSync(fileInfo.filePath, "utf-8");
      let debounceTimer: NodeJS.Timeout | null = null;

      fileInfo.watcher = fs.watch(fileInfo.filePath, (eventType) => {
        if (eventType === "change") {
          // Debounce rapid changes (e.g., from IDE auto-save)
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }

          debounceTimer = setTimeout(() => {
            try {
              const newContent = fs.readFileSync(fileInfo.filePath, "utf-8");
              
              // Only notify if content actually changed
              if (newContent !== lastContent) {
                lastContent = newContent;
                console.log(chalk.cyan(`📝 File changed: ${path.basename(fileInfo.filePath)}`));
                
                if (this.fileUpdateCallback) {
                  this.fileUpdateCallback(fileInfo.filePath, newContent);
                }
              }
            } catch (error) {
              console.error(chalk.red(`❌ Failed to read changed file:`), error);
            }
          }, 100); // 100ms debounce
        }
      });

      console.log(chalk.gray(`  👀 Watching for changes`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to watch file: ${fileInfo.filePath}`), error);
    }
  }

  /**
   * Get the state of open files for a project
   */
  public getProjectState(projectPath: string): ProjectOpenFilesState {
    const openFiles: string[] = [];
    let activeFile: string | null = null;

    for (const [filePath, fileInfo] of this.openFiles) {
      if (fileInfo.projectPath === projectPath) {
        openFiles.push(filePath);
        if (fileInfo.isActive) {
          activeFile = filePath;
        }
      }
    }

    return {
      projectPath,
      openFiles,
      activeFile,
    };
  }

  /**
   * Sync project state - returns open files with their contents
   */
  public async syncProject(projectPath: string): Promise<{
    projectPath: string;
    files: Array<{ path: string; content: string; isActive: boolean }>;
  }> {
    const files: Array<{ path: string; content: string; isActive: boolean }> = [];

    for (const [filePath, fileInfo] of this.openFiles) {
      if (fileInfo.projectPath === projectPath) {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          files.push({
            path: filePath,
            content,
            isActive: fileInfo.isActive,
          });
        } catch (error) {
          console.error(chalk.red(`❌ Failed to read file for sync: ${filePath}`), error);
          // Remove the file if it can't be read
          await this.closeFile(filePath);
        }
      }
    }

    return {
      projectPath,
      files,
    };
  }

  /**
   * Get fresh file content (always read from disk)
   */
  public getFileContent(filePath: string): string | null {
    if (!fs.existsSync(filePath)) {
      console.log(chalk.yellow(`⚠️ File not found: ${filePath}`));
      return null;
    }

    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch (error) {
      console.error(chalk.red(`❌ Failed to read file: ${filePath}`), error);
      return null;
    }
  }

  /**
   * Check if a file is open
   */
  public isFileOpen(filePath: string): boolean {
    return this.openFiles.has(filePath);
  }

  /**
   * Get the currently active file path
   */
  public getActiveFilePath(): string | null {
    for (const [filePath, fileInfo] of this.openFiles) {
      if (fileInfo.isActive) {
        return filePath;
      }
    }
    return null;
  }

  /**
   * Clean up all watchers
   */
  public cleanup(): void {
    console.log(chalk.yellow("🧹 Cleaning up OpenFilesManager..."));

    for (const [_, fileInfo] of this.openFiles) {
      if (fileInfo.watcher) {
        fileInfo.watcher.close();
      }
    }

    this.openFiles.clear();
    this.fileUpdateCallback = null;

    console.log(chalk.green("✅ OpenFilesManager cleaned up"));
  }
}

