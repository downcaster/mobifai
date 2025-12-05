import fs from "fs";
import path from "path";
import chalk from "chalk";
import { exec } from "child_process";

/**
 * Represents a project in the history
 */
export interface ProjectHistory {
  path: string;
  name: string;
  lastOpened: number;
}

/**
 * Represents a file or folder node
 */
export interface FileNode {
  type: "file" | "folder";
  name: string;
  loaded?: boolean;
}

/**
 * Represents a diff hunk (a continuous region of changes)
 */
export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

/**
 * Represents a single line in a diff
 */
export interface DiffLine {
  type: "add" | "delete" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Represents the complete diff for a file
 */
export interface FileDiff {
  filePath: string;
  isGitRepo: boolean;
  hasChanges: boolean;
  hunks: DiffHunk[];
  addedLines: number[];
  deletedLines: { afterLine: number; content: string[] }[];
  modifiedLines: number[];
}

/**
 * CodeManager handles all file system operations for the code editor
 */
export class CodeManager {
  private projectsHistory: ProjectHistory[] = [];
  private historyFilePath: string;
  private currentProject: string | null = null;

  constructor() {
    this.historyFilePath = path.join(process.cwd(), ".projects_history.json");
    this.loadHistory();
  }

  /**
   * Load projects history from disk
   */
  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const data = fs.readFileSync(this.historyFilePath, "utf-8");
        this.projectsHistory = JSON.parse(data);
        console.log(
          chalk.gray(
            `📚 Loaded ${this.projectsHistory.length} project(s) from history`
          )
        );
      }
    } catch (error) {
      console.error(chalk.red("❌ Failed to load projects history:"), error);
      this.projectsHistory = [];
    }
  }

  /**
   * Save projects history to disk
   */
  private saveHistory(): void {
    try {
      fs.writeFileSync(
        this.historyFilePath,
        JSON.stringify(this.projectsHistory, null, 2)
      );
    } catch (error) {
      console.error(chalk.red("❌ Failed to save projects history:"), error);
    }
  }

  /**
   * Add or update a project in history
   */
  private addToHistory(projectPath: string): void {
    const name = path.basename(projectPath);
    const existingIndex = this.projectsHistory.findIndex(
      (p) => p.path === projectPath
    );

    if (existingIndex >= 0) {
      // Update existing entry
      this.projectsHistory[existingIndex].lastOpened = Date.now();
    } else {
      // Add new entry
      this.projectsHistory.unshift({
        path: projectPath,
        name,
        lastOpened: Date.now(),
      });
    }

    // Keep only last 20 projects
    this.projectsHistory = this.projectsHistory.slice(0, 20);

    // Sort by lastOpened (most recent first)
    this.projectsHistory.sort((a, b) => b.lastOpened - a.lastOpened);

    this.saveHistory();
  }

  /**
   * Check if path should be ignored (respects .gitignore patterns)
   */
  private shouldIgnore(name: string): boolean {
    // Common patterns to ignore
    const ignorePatterns = [
      "node_modules",
      ".git",
      ".DS_Store",
      ".vscode",
      ".idea",
      "build",
      "dist",
      ".next",
      "__pycache__",
      ".pytest_cache",
      "*.pyc",
      ".env",
      ".env.local",
    ];

    return ignorePatterns.some((pattern) => {
      if (pattern.startsWith("*.")) {
        return name.endsWith(pattern.slice(1));
      }
      return name === pattern;
    });
  }

  /**
   * Read children of a directory
   */
  private readDirChildren(dirPath: string): FileNode[] {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const children: FileNode[] = [];

      for (const entry of entries) {
        // Skip ignored files/folders
        if (this.shouldIgnore(entry.name)) {
          continue;
        }

        // Skip hidden files (except .gitignore, .env files we might want to edit)
        if (entry.name.startsWith(".") && !["gitignore", "env"].some(s => entry.name.includes(s))) {
          continue;
        }

        children.push({
          type: entry.isDirectory() ? "folder" : "file",
          name: entry.name,
          loaded: false,
        });
      }

      // Sort: folders first, then files, alphabetically
      children.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === "folder" ? -1 : 1;
      });

      return children;
    } catch (error) {
      console.error(chalk.red(`❌ Failed to read directory ${dirPath}:`), error);
      throw new Error(`Failed to read directory: ${error}`);
    }
  }

  /**
   * Initialize a project - returns first-level children
   */
  public initProject(projectPath: string): { rootPath: string; children: FileNode[] } {
    console.log(chalk.cyan(`📂 Initializing project: ${projectPath}`));

    // Check if path exists
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    // Check if it's a directory
    const stat = fs.statSync(projectPath);
    if (!stat.isDirectory()) {
      throw new Error(`Project path is not a directory: ${projectPath}`);
    }

    // Set as current project
    this.currentProject = projectPath;

    // Add to history
    this.addToHistory(projectPath);

    // Read first-level children
    const children = this.readDirChildren(projectPath);

    console.log(
      chalk.green(
        `✅ Project initialized with ${children.length} items at root level`
      )
    );

    return {
      rootPath: projectPath,
      children,
    };
  }

  /**
   * Get children of a folder
   */
  public getFolderChildren(folderPath: string): { folderPath: string; children: FileNode[] } {
    console.log(chalk.gray(`📁 Reading folder: ${folderPath}`));

    // Check if path exists and is a directory
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Folder does not exist: ${folderPath}`);
    }

    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a folder: ${folderPath}`);
    }

    const children = this.readDirChildren(folderPath);

    console.log(chalk.gray(`  └─ ${children.length} items`));

    return {
      folderPath,
      children,
    };
  }

  /**
   * Read file content
   */
  public getFile(filePath: string): { filePath: string; content: string } {
    console.log(chalk.gray(`📄 Reading file: ${filePath}`));

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    // Check if it's a file
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    // Check file size (limit to 10MB for safety)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(`File too large (${Math.round(stat.size / 1024 / 1024)}MB). Max: 10MB`);
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      console.log(
        chalk.gray(`  └─ ${content.length} characters, ${content.split("\n").length} lines`)
      );
      return { filePath, content };
    } catch (error) {
      // If it's a binary file or encoding error
      throw new Error(`Failed to read file (might be binary): ${error}`);
    }
  }

  /**
   * Save file content
   */
  public saveFile(
    filePath: string,
    newContent: string
  ): { filePath: string; success: boolean } {
    console.log(chalk.cyan(`💾 Saving file: ${filePath}`));

    try {
      // Create backup if file exists
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.backup`;
        fs.copyFileSync(filePath, backupPath);
        console.log(chalk.gray(`  └─ Backup created: ${backupPath}`));
      }

      // Write the file
      fs.writeFileSync(filePath, newContent, "utf-8");

      console.log(chalk.green(`✅ File saved: ${filePath}`));

      return { filePath, success: true };
    } catch (error) {
      console.error(chalk.red(`❌ Failed to save file: ${filePath}`), error);
      throw new Error(`Failed to save file: ${error}`);
    }
  }

  /**
   * Close project and cleanup
   */
  public closeProject(projectPath: string): void {
    console.log(chalk.gray(`🔒 Closing project: ${projectPath}`));
    
    if (this.currentProject === projectPath) {
      this.currentProject = null;
    }

    console.log(chalk.gray(`✅ Project closed`));
  }

  /**
   * Get projects history
   */
  public getProjectsHistory(): ProjectHistory[] {
    return this.projectsHistory;
  }

  /**
   * Create a new file
   */
  public createFile(
    folderPath: string,
    fileName: string
  ): { filePath: string; parentFolder: string } {
    console.log(chalk.cyan(`📝 Creating file: ${fileName} in ${folderPath}`));

    // Check if parent folder exists
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Parent folder does not exist: ${folderPath}`);
    }

    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a folder: ${folderPath}`);
    }

    const filePath = path.join(folderPath, fileName);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      throw new Error(`File already exists: ${filePath}`);
    }

    // Validate file name
    if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
      throw new Error(`Invalid file name: ${fileName}`);
    }

    try {
      // Create empty file
      fs.writeFileSync(filePath, "", "utf-8");
      console.log(chalk.green(`✅ File created: ${filePath}`));

      return { filePath, parentFolder: folderPath };
    } catch (error) {
      console.error(chalk.red(`❌ Failed to create file: ${filePath}`), error);
      throw new Error(`Failed to create file: ${error}`);
    }
  }

  /**
   * Create a new folder
   */
  public createFolder(
    parentPath: string,
    folderName: string
  ): { folderPath: string; parentFolder: string } {
    console.log(chalk.cyan(`📁 Creating folder: ${folderName} in ${parentPath}`));

    // Check if parent folder exists
    if (!fs.existsSync(parentPath)) {
      throw new Error(`Parent folder does not exist: ${parentPath}`);
    }

    const stat = fs.statSync(parentPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a folder: ${parentPath}`);
    }

    const folderPath = path.join(parentPath, folderName);

    // Check if folder already exists
    if (fs.existsSync(folderPath)) {
      throw new Error(`Folder already exists: ${folderPath}`);
    }

    // Validate folder name
    if (!folderName || folderName.includes("/") || folderName.includes("\\")) {
      throw new Error(`Invalid folder name: ${folderName}`);
    }

    try {
      // Create folder
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(chalk.green(`✅ Folder created: ${folderPath}`));

      return { folderPath, parentFolder: parentPath };
    } catch (error) {
      console.error(chalk.red(`❌ Failed to create folder: ${folderPath}`), error);
      throw new Error(`Failed to create folder: ${error}`);
    }
  }

  /**
   * Rename a file or folder
   */
  public renameItem(
    oldPath: string,
    newName: string
  ): { oldPath: string; newPath: string; parentFolder: string } {
    console.log(chalk.cyan(`✏️ Renaming: ${oldPath} to ${newName}`));

    // Check if item exists
    if (!fs.existsSync(oldPath)) {
      throw new Error(`Item does not exist: ${oldPath}`);
    }

    // Validate new name
    if (!newName || newName.includes("/") || newName.includes("\\")) {
      throw new Error(`Invalid name: ${newName}`);
    }

    const parentFolder = path.dirname(oldPath);
    const newPath = path.join(parentFolder, newName);

    // Check if new path already exists
    if (fs.existsSync(newPath)) {
      throw new Error(`Item already exists: ${newPath}`);
    }

    try {
      fs.renameSync(oldPath, newPath);
      console.log(chalk.green(`✅ Renamed: ${oldPath} → ${newPath}`));

      return { oldPath, newPath, parentFolder };
    } catch (error) {
      console.error(chalk.red(`❌ Failed to rename: ${oldPath}`), error);
      throw new Error(`Failed to rename: ${error}`);
    }
  }

  /**
   * Delete a file or folder
   */
  public deleteItem(itemPath: string): { deletedPath: string; parentFolder: string } {
    console.log(chalk.cyan(`🗑️ Deleting: ${itemPath}`));

    // Check if item exists
    if (!fs.existsSync(itemPath)) {
      throw new Error(`Item does not exist: ${itemPath}`);
    }

    const parentFolder = path.dirname(itemPath);

    try {
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Delete folder recursively
        fs.rmSync(itemPath, { recursive: true, force: true });
      } else {
        // Delete file
        fs.unlinkSync(itemPath);
      }

      console.log(chalk.green(`✅ Deleted: ${itemPath}`));

      return { deletedPath: itemPath, parentFolder };
    } catch (error) {
      console.error(chalk.red(`❌ Failed to delete: ${itemPath}`), error);
      throw new Error(`Failed to delete: ${error}`);
    }
  }

  /**
   * Find the git repository root for a given file path
   */
  private findGitRoot(filePath: string): string | null {
    let currentDir = path.dirname(filePath);
    
    while (currentDir !== path.dirname(currentDir)) { // Stop at filesystem root
      if (fs.existsSync(path.join(currentDir, ".git"))) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
    
    return null;
  }

  /**
   * Parse unified diff output into structured data
   */
  private parseDiff(diffOutput: string, filePath: string): FileDiff {
    console.log(chalk.gray(`  └─ Parsing diff output (${diffOutput.length} chars)`));
    
    const result: FileDiff = {
      filePath,
      isGitRepo: true,
      hasChanges: diffOutput.trim().length > 0,
      hunks: [],
      addedLines: [],
      deletedLines: [],
      modifiedLines: [],
    };

    if (!result.hasChanges) {
      return result;
    }

    const lines = diffOutput.split("\n");
    console.log(chalk.gray(`  └─ Diff has ${lines.length} lines`));
    
    let currentHunk: DiffHunk | null = null;
    let oldLineNum = 0;
    let newLineNum = 0;

    // Track deleted lines for inline display
    const deletedAtLine: Map<number, string[]> = new Map();
    let pendingDeletes: string[] = [];
    let deleteAfterLine = 0;

    for (const line of lines) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      
      if (hunkMatch) {
        console.log(chalk.gray(`  └─ Found hunk: @@ -${hunkMatch[1]},${hunkMatch[2]} +${hunkMatch[3]},${hunkMatch[4]} @@`));
        
        // Save pending deletes from previous hunk
        if (pendingDeletes.length > 0) {
          deletedAtLine.set(deleteAfterLine, [...pendingDeletes]);
          pendingDeletes = [];
        }

        currentHunk = {
          oldStart: parseInt(hunkMatch[1], 10),
          oldCount: parseInt(hunkMatch[2] || "1", 10),
          newStart: parseInt(hunkMatch[3], 10),
          newCount: parseInt(hunkMatch[4] || "1", 10),
          lines: [],
        };
        result.hunks.push(currentHunk);
        oldLineNum = currentHunk.oldStart;
        newLineNum = currentHunk.newStart;
        deleteAfterLine = newLineNum > 0 ? newLineNum - 1 : 0;
        continue;
      }

      if (!currentHunk) continue;

      // Skip diff header lines
      if (line.startsWith("diff ") || line.startsWith("index ") || 
          line.startsWith("---") || line.startsWith("+++")) {
        continue;
      }

      if (line.startsWith("+")) {
        // Added line
        const content = line.substring(1);
        currentHunk.lines.push({
          type: "add",
          content,
          newLineNumber: newLineNum,
        });
        result.addedLines.push(newLineNum);
        
        // Check if this is a modification (delete followed by add)
        if (pendingDeletes.length > 0) {
          // This is part of a modification
          result.modifiedLines.push(newLineNum);
        }
        
        // Save any pending deletes before this add
        if (pendingDeletes.length > 0) {
          deletedAtLine.set(deleteAfterLine, [...pendingDeletes]);
          pendingDeletes = [];
        }
        
        deleteAfterLine = newLineNum;
        newLineNum++;
      } else if (line.startsWith("-")) {
        // Deleted line
        const content = line.substring(1);
        currentHunk.lines.push({
          type: "delete",
          content,
          oldLineNumber: oldLineNum,
        });
        pendingDeletes.push(content);
        oldLineNum++;
      } else if (line.startsWith(" ") || line === "") {
        // Context line
        const content = line.substring(1);
        currentHunk.lines.push({
          type: "context",
          content,
          oldLineNumber: oldLineNum,
          newLineNumber: newLineNum,
        });
        
        // Save any pending deletes
        if (pendingDeletes.length > 0) {
          deletedAtLine.set(deleteAfterLine, [...pendingDeletes]);
          pendingDeletes = [];
        }
        
        deleteAfterLine = newLineNum;
        oldLineNum++;
        newLineNum++;
      }
    }

    // Save any remaining pending deletes
    if (pendingDeletes.length > 0) {
      deletedAtLine.set(deleteAfterLine, pendingDeletes);
    }

    // Convert deletedAtLine map to array format
    deletedAtLine.forEach((content, afterLine) => {
      result.deletedLines.push({ afterLine, content });
    });

    // Sort deleted lines by position
    result.deletedLines.sort((a, b) => a.afterLine - b.afterLine);

    console.log(chalk.gray(`  └─ Parsed diff: ${result.addedLines.length} added, ${result.deletedLines.length} deleted regions, ${result.modifiedLines.length} modified`));

    return result;
  }

  /**
   * Get git diff for a file against HEAD
   */
  public getFileDiff(filePath: string): Promise<FileDiff> {
    return new Promise((resolve) => {
      console.log(chalk.cyan(`📊 Getting diff for: ${filePath}`));

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        resolve({
          filePath,
          isGitRepo: false,
          hasChanges: false,
          hunks: [],
          addedLines: [],
          deletedLines: [],
          modifiedLines: [],
        });
        return;
      }

      // Find git root
      const gitRoot = this.findGitRoot(filePath);
      if (!gitRoot) {
        console.log(chalk.yellow(`  └─ Not in a git repository`));
        resolve({
          filePath,
          isGitRepo: false,
          hasChanges: false,
          hunks: [],
          addedLines: [],
          deletedLines: [],
          modifiedLines: [],
        });
        return;
      }

      // Get relative path from git root
      const relativePath = path.relative(gitRoot, filePath);
      console.log(chalk.gray(`  └─ Git root: ${gitRoot}`));
      console.log(chalk.gray(`  └─ Relative path: ${relativePath}`));

      // Run git diff (--no-color to avoid ANSI escape codes)
      const diffCommand = `git diff --no-color HEAD -- "${relativePath}"`;
      console.log(chalk.gray(`  └─ Running: ${diffCommand}`));
      
      exec(
        diffCommand,
        { cwd: gitRoot, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          console.log(chalk.gray(`  └─ Diff output length: ${stdout?.length || 0}, error: ${error?.message || 'none'}`));
          if (stdout && stdout.length > 0) {
            console.log(chalk.gray(`  └─ First 200 chars of diff: ${stdout.substring(0, 200).replace(/\n/g, '\\n')}`));
          }
          if (error) {
            // Check if it's a new untracked file
            exec(
              `git ls-files --error-unmatch "${relativePath}"`,
              { cwd: gitRoot },
              (lsError) => {
                if (lsError) {
                  // File is untracked - treat entire file as added
                  console.log(chalk.yellow(`  └─ Untracked file (new)`));
                  try {
                    const content = fs.readFileSync(filePath, "utf-8");
                    const lineCount = content.split("\n").length;
                    const addedLines = Array.from({ length: lineCount }, (_, i) => i + 1);
                    resolve({
                      filePath,
                      isGitRepo: true,
                      hasChanges: true,
                      hunks: [],
                      addedLines,
                      deletedLines: [],
                      modifiedLines: [],
                    });
                  } catch {
                    resolve({
                      filePath,
                      isGitRepo: true,
                      hasChanges: false,
                      hunks: [],
                      addedLines: [],
                      deletedLines: [],
                      modifiedLines: [],
                    });
                  }
                } else {
                  console.error(chalk.red(`  └─ Git diff error: ${stderr || error.message}`));
                  resolve({
                    filePath,
                    isGitRepo: true,
                    hasChanges: false,
                    hunks: [],
                    addedLines: [],
                    deletedLines: [],
                    modifiedLines: [],
                  });
                }
              }
            );
            return;
          }

          const diff = this.parseDiff(stdout, filePath);
          resolve(diff);
        }
      );
    });
  }
}

