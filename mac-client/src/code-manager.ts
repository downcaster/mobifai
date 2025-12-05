import fs from "fs";
import path from "path";
import chalk from "chalk";

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
}

