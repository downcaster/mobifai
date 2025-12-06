import { exec } from "child_process";
import chalk from "chalk";
import * as path from "path";
import * as fs from "fs";

/**
 * Callback type for git changes events
 */
export type GitChangesCallback = (projectPath: string, changes: {
  staged: Array<{ path: string; type: string }>;
  unstaged: Array<{ path: string; type: string }>;
}) => void;

/**
 * GitWatcher - Polls git status for a project to detect file changes
 * 
 * More efficient than watching individual files - just runs `git status --porcelain`
 * periodically (similar to how VS Code does it)
 */
export class GitWatcher {
  private watchedProjects: Map<string, NodeJS.Timeout> = new Map();
  private lastKnownState: Map<string, string> = new Map(); // projectPath -> git status output
  private callback: GitChangesCallback | null = null;
  private pollInterval: number = 2000; // Poll every 2 seconds

  /**
   * Set the callback for git changes events
   */
  public onChanges(callback: GitChangesCallback): void {
    this.callback = callback;
  }

  /**
   * Start watching a project for git changes
   */
  public startWatching(projectPath: string): void {
    // Check if it's a git repo
    const gitDir = path.join(projectPath, ".git");
    if (!fs.existsSync(gitDir)) {
      console.log(chalk.yellow(`⚠️  Not a git repository: ${projectPath}`));
      return;
    }

    // Already watching?
    if (this.watchedProjects.has(projectPath)) {
      console.log(chalk.gray(`Already watching: ${path.basename(projectPath)}`));
      return;
    }

    console.log(chalk.cyan(`👀 Starting git watcher for: ${path.basename(projectPath)}`));
    
    // Initial check
    this.checkForChanges(projectPath);

    // Set up polling interval
    const interval = setInterval(() => {
      this.checkForChanges(projectPath);
    }, this.pollInterval);

    this.watchedProjects.set(projectPath, interval);
  }

  /**
   * Stop watching a project
   */
  public stopWatching(projectPath: string): void {
    const interval = this.watchedProjects.get(projectPath);
    if (interval) {
      clearInterval(interval);
      this.watchedProjects.delete(projectPath);
      this.lastKnownState.delete(projectPath);
      console.log(chalk.gray(`Stopped watching: ${path.basename(projectPath)}`));
    }
  }

  /**
   * Stop watching all projects
   */
  public stopAll(): void {
    for (const [projectPath, interval] of this.watchedProjects) {
      clearInterval(interval);
    }
    this.watchedProjects.clear();
    this.lastKnownState.clear();
    console.log(chalk.gray(`Stopped all git watchers`));
  }

  /**
   * Check for changes in a project
   */
  private checkForChanges(projectPath: string): void {
    exec(
      `git status --porcelain -uall`,
      { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          console.error(chalk.red(`❌ Git status error for ${projectPath}:`), error.message);
          return;
        }

        // Compare with last known state
        const lastState = this.lastKnownState.get(projectPath);
        if (stdout !== lastState) {
          // Changes detected!
          this.lastKnownState.set(projectPath, stdout);
          
          // Parse the changes
          const changes = this.parseGitStatus(projectPath, stdout);
          
          // Only notify if there are actual changes (not just initial state)
          if (lastState !== undefined && this.callback) {
            console.log(chalk.green(`📝 Git changes detected in ${path.basename(projectPath)}`));
            console.log(chalk.gray(`   Staged: ${changes.staged.length}, Unstaged: ${changes.unstaged.length}`));
            this.callback(projectPath, changes);
          } else if (lastState === undefined) {
            // Initial state - just store it, don't notify
            console.log(chalk.gray(`📊 Initial git state: ${changes.staged.length} staged, ${changes.unstaged.length} unstaged`));
          }
        }
      }
    );
  }

  /**
   * Parse git status --porcelain output
   */
  private parseGitStatus(projectPath: string, output: string): {
    staged: Array<{ path: string; type: string }>;
    unstaged: Array<{ path: string; type: string }>;
  } {
    const staged: Array<{ path: string; type: string }> = [];
    const unstaged: Array<{ path: string; type: string }> = [];

    const lines = output.split('\n').filter(line => line.trim() !== '');

    for (const line of lines) {
      // Format: XY PATH
      // X = index status, Y = working tree status
      const indexStatus = line[0];
      const worktreeStatus = line[1];
      const filePath = line.substring(3).trim();
      const absolutePath = path.join(projectPath, filePath);

      // Staged changes (index status)
      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push({
          path: absolutePath,
          type: this.getChangeType(indexStatus),
        });
      }

      // Unstaged changes (working tree status)
      if (worktreeStatus !== ' ') {
        unstaged.push({
          path: absolutePath,
          type: this.getChangeType(worktreeStatus),
        });
      }
    }

    return { staged, unstaged };
  }

  /**
   * Convert git status letter to change type
   */
  private getChangeType(letter: string): string {
    switch (letter) {
      case 'M': return 'modified';
      case 'A': return 'added';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      case '?': return 'untracked';
      default: return 'unknown';
    }
  }

  /**
   * Get current changes for a project (without waiting for poll)
   */
  public async getCurrentChanges(projectPath: string): Promise<{
    staged: Array<{ path: string; type: string }>;
    unstaged: Array<{ path: string; type: string }>;
  }> {
    return new Promise((resolve) => {
      exec(
        `git status --porcelain -uall`,
        { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            resolve({ staged: [], unstaged: [] });
            return;
          }
          resolve(this.parseGitStatus(projectPath, stdout));
        }
      );
    });
  }
}

