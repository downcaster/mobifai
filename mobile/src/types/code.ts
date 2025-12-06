/**
 * Types for Code Layer - file system operations and project management
 */

/**
 * Represents a project in the history list
 */
export interface CodeProject {
  /** Absolute path to the project directory */
  path: string;
  /** Display name of the project */
  name: string;
  /** Timestamp when the project was last opened */
  lastOpened: number;
}

/**
 * Represents a file or folder node in the file tree
 */
export interface FileNode {
  /** Type of node */
  type: 'file' | 'folder';
  /** Name of the file or folder */
  name: string;
  /** For folders: whether children have been loaded */
  loaded?: boolean;
}

/**
 * Represents a file change detected by git
 */
export interface FileChange {
  /** Absolute path to the changed file */
  path: string;
  /** Type of change (modified, added, deleted, etc.) */
  type: string;
}

// ============================================================================
// Request Payloads (Mobile -> Mac)
// ============================================================================

/**
 * Payload for code.initProject command
 * Opens a project and returns its root structure
 */
export interface CodeInitPayload {
  projectPath: string;
}

/**
 * Payload for code.getFolderChildren command
 * Requests children of a specific folder
 */
export interface CodeFolderChildrenPayload {
  folderPath: string;
}

/**
 * Payload for code.getFile command
 * Requests content of a specific file
 */
export interface CodeFilePayload {
  filePath: string;
}

/**
 * Payload for code.saveFile command
 * Saves new content to a file
 */
export interface CodeSavePayload {
  filePath: string;
  newContent: string;
}

/**
 * Payload for code.closeProject command
 * Closes a project and cleans up resources
 */
export interface CodeClosePayload {
  projectPath: string;
}

// ============================================================================
// Response Payloads (Mac -> Mobile)
// ============================================================================

/**
 * Response for code.projectInitialized event
 * Contains root path and first-level children
 */
export interface ProjectInitializedResponse {
  rootPath: string;
  children: FileNode[];
}

/**
 * Response for code.folderChildren event
 * Contains children of the requested folder
 */
export interface FolderChildrenResponse {
  folderPath: string;
  children: FileNode[];
}

/**
 * Response for code.fileContent event
 * Contains the content of the requested file
 */
export interface FileContentResponse {
  filePath: string;
  content: string;
}

/**
 * Response for code.fileSaved event
 * Confirms successful file save
 */
export interface FileSavedResponse {
  filePath: string;
  success: boolean;
}

/**
 * Response for code.fileSaveError event
 * Indicates a save failure
 */
export interface FileSaveErrorResponse {
  filePath: string;
  error: string;
}

/**
 * Response for code.projectsHistory event
 * Contains list of recently opened projects
 */
export interface ProjectsHistoryResponse {
  projects: CodeProject[];
}

/**
 * Generic error response for code layer
 */
export interface CodeErrorResponse {
  action: string;
  error: string;
  details?: string;
}

