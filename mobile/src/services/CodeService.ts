import { WebRTCService } from './WebRTCService';
import {
  CodeProject,
  FileNode,
  CodeInitPayload,
  CodeFolderChildrenPayload,
  CodeFilePayload,
  CodeSavePayload,
  CodeClosePayload,
  ProjectInitializedResponse,
  FolderChildrenResponse,
  FileContentResponse,
  FileSavedResponse,
  FileSaveErrorResponse,
  ProjectsHistoryResponse,
  CodeErrorResponse,
} from '../types/code';

type CodeMessageHandler = (action: string, payload: any) => void;

/**
 * CodeService handles all code layer communication via WebRTC
 */
export class CodeService {
  private static instance: CodeService | null = null;
  private webrtcService: WebRTCService | null = null;
  private messageHandlers: Map<string, CodeMessageHandler[]> = new Map();

  private constructor() {}

  public static getInstance(): CodeService {
    if (!CodeService.instance) {
      CodeService.instance = new CodeService();
    }
    return CodeService.instance;
  }

  /**
   * Initialize with WebRTC service
   */
  public initialize(webrtcService: WebRTCService): void {
    this.webrtcService = webrtcService;
  }

  /**
   * Subscribe to code layer responses
   */
  public onMessage(action: string, handler: CodeMessageHandler): () => void {
    if (!this.messageHandlers.has(action)) {
      this.messageHandlers.set(action, []);
    }
    
    const handlers = this.messageHandlers.get(action)!;
    handlers.push(handler);

    // Return unsubscribe function
    return () => {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  /**
   * Handle incoming code message
   */
  public handleIncomingMessage(action: string, payload: any): void {
    const handlers = this.messageHandlers.get(action);
    if (handlers) {
      handlers.forEach((handler) => handler(action, payload));
    }
  }

  /**
   * Check if the service is initialized
   */
  public isInitialized(): boolean {
    return this.webrtcService !== null;
  }

  /**
   * Send a code layer message
   */
  private sendMessage(action: string, payload: any): boolean {
    if (!this.webrtcService) {
      console.warn('CodeService: Not connected to WebRTC service');
      return false;
    }

    return this.webrtcService.sendMessage('code', action, payload);
  }

  /**
   * Request projects history
   */
  public getProjectsHistory(): Promise<CodeProject[]> {
    return new Promise((resolve, reject) => {
      // Return empty array if not connected
      if (!this.isInitialized()) {
        resolve([]);
        return;
      }

      const unsubscribe = this.onMessage('code:projectsHistory', (_action, payload: ProjectsHistoryResponse) => {
        unsubscribe();
        resolve(payload.projects);
      });

      const errorUnsubscribe = this.onMessage('code:error', (_action, payload: CodeErrorResponse) => {
        if (payload.action === 'getProjectsHistory') {
          errorUnsubscribe();
          reject(new Error(payload.error));
        }
      });

      const sent = this.sendMessage('getProjectsHistory', {});
      if (!sent) {
        unsubscribe();
        errorUnsubscribe();
        resolve([]); // Return empty instead of rejecting
        return;
      }

      // Timeout after 10 seconds
      setTimeout(() => {
        unsubscribe();
        errorUnsubscribe();
        resolve([]); // Return empty instead of rejecting on timeout
      }, 10000);
    });
  }

  /**
   * Initialize a project
   */
  public initProject(projectPath: string): Promise<ProjectInitializedResponse> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.onMessage('code:projectInitialized', (_action, payload: ProjectInitializedResponse) => {
        unsubscribe();
        resolve(payload);
      });

      const errorUnsubscribe = this.onMessage('code:error', (_action, payload: CodeErrorResponse) => {
        if (payload.action === 'initProject') {
          errorUnsubscribe();
          reject(new Error(payload.error));
        }
      });

      const payload: CodeInitPayload = { projectPath };
      const sent = this.sendMessage('initProject', payload);
      
      if (!sent) {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Failed to send message'));
      }

      setTimeout(() => {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }

  /**
   * Get folder children
   */
  public getFolderChildren(folderPath: string): Promise<FileNode[]> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.onMessage('code:folderChildren', (_action, payload: FolderChildrenResponse) => {
        if (payload.folderPath === folderPath) {
          unsubscribe();
          resolve(payload.children);
        }
      });

      const errorUnsubscribe = this.onMessage('code:error', (_action, payload: CodeErrorResponse) => {
        if (payload.action === 'getFolderChildren') {
          errorUnsubscribe();
          reject(new Error(payload.error));
        }
      });

      const payload: CodeFolderChildrenPayload = { folderPath };
      const sent = this.sendMessage('getFolderChildren', payload);
      
      if (!sent) {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Failed to send message'));
      }

      setTimeout(() => {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }

  /**
   * Get file content
   */
  public getFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.onMessage('code:fileContent', (_action, payload: FileContentResponse) => {
        if (payload.filePath === filePath) {
          unsubscribe();
          resolve(payload.content);
        }
      });

      const errorUnsubscribe = this.onMessage('code:error', (_action, payload: CodeErrorResponse) => {
        if (payload.action === 'getFile') {
          errorUnsubscribe();
          reject(new Error(payload.error));
        }
      });

      const payload: CodeFilePayload = { filePath };
      const sent = this.sendMessage('getFile', payload);
      
      if (!sent) {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Failed to send message'));
      }

      setTimeout(() => {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }

  /**
   * Save file
   */
  public saveFile(filePath: string, newContent: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.onMessage('code:fileSaved', (_action, payload: FileSavedResponse) => {
        if (payload.filePath === filePath) {
          unsubscribe();
          resolve(payload.success);
        }
      });

      const errorUnsubscribe = this.onMessage('code:fileSaveError', (_action, payload: FileSaveErrorResponse) => {
        if (payload.filePath === filePath) {
          errorUnsubscribe();
          reject(new Error(payload.error));
        }
      });

      const payload: CodeSavePayload = { filePath, newContent };
      const sent = this.sendMessage('saveFile', payload);
      
      if (!sent) {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Failed to send message'));
      }

      setTimeout(() => {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }

  /**
   * Close project
   */
  public closeProject(projectPath: string): void {
    const payload: CodeClosePayload = { projectPath };
    this.sendMessage('closeProject', payload);
  }

  /**
   * Create a new file
   */
  public createFile(folderPath: string, fileName: string): Promise<{ filePath: string; parentFolder: string; children: FileNode[] }> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.onMessage('code:fileCreated', (_action, payload: { filePath: string; parentFolder: string; children: FileNode[] }) => {
        if (payload.parentFolder === folderPath) {
          unsubscribe();
          resolve(payload);
        }
      });

      const errorUnsubscribe = this.onMessage('code:createFileError', (_action, payload: { folderPath: string; fileName: string; error: string }) => {
        if (payload.folderPath === folderPath && payload.fileName === fileName) {
          errorUnsubscribe();
          reject(new Error(payload.error));
        }
      });

      const sent = this.sendMessage('createFile', { folderPath, fileName });
      
      if (!sent) {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Failed to send message'));
      }

      setTimeout(() => {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }

  /**
   * Create a new folder
   */
  public createFolder(parentPath: string, folderName: string): Promise<{ folderPath: string; parentFolder: string; children: FileNode[] }> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.onMessage('code:folderCreated', (_action, payload: { folderPath: string; parentFolder: string; children: FileNode[] }) => {
        if (payload.parentFolder === parentPath) {
          unsubscribe();
          resolve(payload);
        }
      });

      const errorUnsubscribe = this.onMessage('code:createFolderError', (_action, payload: { parentPath: string; folderName: string; error: string }) => {
        if (payload.parentPath === parentPath && payload.folderName === folderName) {
          errorUnsubscribe();
          reject(new Error(payload.error));
        }
      });

      const sent = this.sendMessage('createFolder', { parentPath, folderName });
      
      if (!sent) {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Failed to send message'));
      }

      setTimeout(() => {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }

  /**
   * Rename a file or folder
   */
  public renameItem(oldPath: string, newName: string): Promise<{ oldPath: string; newPath: string; parentFolder: string; children: FileNode[] }> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.onMessage('code:itemRenamed', (_action, payload: { oldPath: string; newPath: string; parentFolder: string; children: FileNode[] }) => {
        if (payload.oldPath === oldPath) {
          unsubscribe();
          resolve(payload);
        }
      });

      const errorUnsubscribe = this.onMessage('code:renameError', (_action, payload: { path: string; error: string }) => {
        if (payload.path === oldPath) {
          errorUnsubscribe();
          reject(new Error(payload.error));
        }
      });

      const sent = this.sendMessage('renameItem', { oldPath, newName });
      
      if (!sent) {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Failed to send message'));
      }

      setTimeout(() => {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }

  /**
   * Delete a file or folder
   */
  public deleteItem(itemPath: string): Promise<{ deletedPath: string; parentFolder: string; children: FileNode[] }> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.onMessage('code:itemDeleted', (_action, payload: { deletedPath: string; parentFolder: string; children: FileNode[] }) => {
        if (payload.deletedPath === itemPath) {
          unsubscribe();
          resolve(payload);
        }
      });

      const errorUnsubscribe = this.onMessage('code:deleteError', (_action, payload: { path: string; error: string }) => {
        if (payload.path === itemPath) {
          errorUnsubscribe();
          reject(new Error(payload.error));
        }
      });

      const sent = this.sendMessage('deleteItem', { itemPath });
      
      if (!sent) {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Failed to send message'));
      }

      setTimeout(() => {
        unsubscribe();
        errorUnsubscribe();
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }

  /**
   * Cleanup
   */
  public cleanup(): void {
    this.messageHandlers.clear();
    this.webrtcService = null;
  }
}

// Export singleton instance
export const codeService = CodeService.getInstance();

