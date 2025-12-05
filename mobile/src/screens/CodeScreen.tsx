import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, AppCard } from '../components/ui';
import { CodeEditor } from '../components/code/CodeEditor';
import { FileTree } from '../components/code/FileTree';
import { EditorTabs, OpenFile } from '../components/code/EditorTabs';
import { colors } from '../theme/colors';
import { CodeProject, FileNode } from '../types/code';
import { useInitProject, useFileContent, useSaveFile, useProjectsHistory } from '../hooks/useCodeQueries';
import { codeService } from '../services/CodeService';
import { useQueryClient } from '@tanstack/react-query';

interface ProjectState {
  path: string;
  name: string;
  rootChildren: FileNode[];
}

type ViewMode = 'history' | 'editor';

export default function CodeScreen(): React.ReactElement {
  const queryClient = useQueryClient();
  
  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('history');
  
  // Project state
  const [currentProject, setCurrentProject] = useState<ProjectState | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());

  // Queries
  const { data: projects, isLoading: isLoadingProjects } = useProjectsHistory();
  const initProjectMutation = useInitProject();
  const saveFileMutation = useSaveFile();

  // Fetch active file content
  const { data: activeFileContent, isLoading: isLoadingFile } = useFileContent(activeFile);

  // Update file content when loaded
  useEffect(() => {
    if (activeFile && activeFileContent !== undefined && !fileContents[activeFile]) {
      setFileContents((prev) => ({
        ...prev,
        [activeFile]: activeFileContent,
      }));
    }
  }, [activeFile, activeFileContent, fileContents]);

  // Listen for openProject events from Terminal
  useEffect(() => {
    const handleOpenProject = codeService.onMessage('code:projectInitialized', (_action, payload) => {
      // Handle direct project open from Terminal button
      if (payload.rootPath) {
        const projectName = payload.rootPath.split('/').pop() || 'Project';
        setCurrentProject({
          path: payload.rootPath,
          name: projectName,
          rootChildren: payload.children || [],
        });
        setViewMode('editor');
        
        // Optimistically add to history
        queryClient.setQueryData<CodeProject[]>(['projects'], (old) => {
          const newProject: CodeProject = {
            path: payload.rootPath,
            name: projectName,
            lastOpened: Date.now(),
          };
          if (!old) return [newProject];
          const filtered = old.filter(p => p.path !== payload.rootPath);
          return [newProject, ...filtered];
        });
      }
    });

    return () => {
      handleOpenProject();
    };
  }, [queryClient]);

  // Handle project selection from history
  const handleProjectSelect = useCallback(
    async (project: CodeProject) => {
      try {
        const result = await initProjectMutation.mutateAsync(project.path);
        setCurrentProject({
          path: result.rootPath,
          name: project.name,
          rootChildren: result.children,
        });
        setViewMode('editor');
      } catch (error: any) {
        Alert.alert('Error', `Failed to open project: ${error.message}`);
      }
    },
    [initProjectMutation]
  );

  // Handle file selection from tree
  const handleFileSelect = useCallback((filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath;

    // Check if file is already open
    const existingFile = openFiles.find((f) => f.path === filePath);
    if (existingFile) {
      setActiveFile(filePath);
      return;
    }

    // Add to open files
    const newFile: OpenFile = {
      path: filePath,
      name: fileName,
      isDirty: false,
    };
    setOpenFiles((prev) => [...prev, newFile]);
    setActiveFile(filePath);
  }, [openFiles]);

  // Handle file close
  const handleCloseFile = useCallback(
    (filePath: string) => {
      const isDirty = dirtyFiles.has(filePath);
      
      if (isDirty) {
        Alert.alert(
          'Unsaved Changes',
          'Do you want to save changes before closing?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: "Don't Save",
              style: 'destructive',
              onPress: () => performCloseFile(filePath),
            },
            {
              text: 'Save',
              onPress: async () => {
                await handleSaveFile(filePath);
                performCloseFile(filePath);
              },
            },
          ]
        );
      } else {
        performCloseFile(filePath);
      }
    },
    [dirtyFiles]
  );

  const performCloseFile = (filePath: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.path !== filePath));
    setFileContents((prev) => {
      const newContents = { ...prev };
      delete newContents[filePath];
      return newContents;
    });
    setDirtyFiles((prev) => {
      const newDirty = new Set(prev);
      newDirty.delete(filePath);
      return newDirty;
    });

    if (activeFile === filePath) {
      const remainingFiles = openFiles.filter((f) => f.path !== filePath);
      setActiveFile(remainingFiles.length > 0 ? remainingFiles[0].path : null);
    }
  };

  // Handle content change
  const handleContentChange = useCallback(
    (content: string) => {
      if (!activeFile) return;

      setFileContents((prev) => ({
        ...prev,
        [activeFile]: content,
      }));

      const originalContent = activeFileContent || '';
      const isDirty = content !== originalContent;
      
      setDirtyFiles((prev) => {
        const newDirty = new Set(prev);
        if (isDirty) {
          newDirty.add(activeFile);
        } else {
          newDirty.delete(activeFile);
        }
        return newDirty;
      });

      setOpenFiles((prev) =>
        prev.map((f) => f.path === activeFile ? { ...f, isDirty } : f)
      );
    },
    [activeFile, activeFileContent]
  );

  // Handle save
  const handleSaveFile = useCallback(
    async (filePath?: string) => {
      const pathToSave = filePath || activeFile;
      if (!pathToSave) return;

      const content = fileContents[pathToSave];
      if (content === undefined) return;

      try {
        await saveFileMutation.mutateAsync({
          filePath: pathToSave,
          content,
        });

        setDirtyFiles((prev) => {
          const newDirty = new Set(prev);
          newDirty.delete(pathToSave);
          return newDirty;
        });

        setOpenFiles((prev) =>
          prev.map((f) => f.path === pathToSave ? { ...f, isDirty: false } : f)
        );
      } catch (error: any) {
        Alert.alert('Error', `Failed to save file: ${error.message}`);
      }
    },
    [activeFile, fileContents, saveFileMutation]
  );

  // Get language from file path
  const getLanguage = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'md': 'markdown',
    };
    return langMap[ext || ''] || 'javascript';
  };

  // Go back to history
  const handleBackToHistory = () => {
    setViewMode('history');
    setCurrentProject(null);
    setOpenFiles([]);
    setActiveFile(null);
    setFileContents({});
    setDirtyFiles(new Set());
  };

  // Get time ago string
  const getTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  // History View
  if (viewMode === 'history') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <AppText style={styles.headerTitle}>Code Editor</AppText>
        </View>

        <ScrollView style={styles.historyContainer} contentContainerStyle={styles.historyContent}>
          {/* Section Header */}
          <View style={styles.sectionHeader}>
            <AppText style={styles.sectionTitle}>Recent Projects</AppText>
          </View>

          {/* Loading State */}
          {isLoadingProjects && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <AppText style={styles.loadingText}>Loading projects...</AppText>
            </View>
          )}

          {/* Projects List */}
          {!isLoadingProjects && projects && projects.length > 0 && (
            <View style={styles.projectsList}>
              {projects.map((project) => (
                <TouchableOpacity
                  key={project.path}
                  onPress={() => handleProjectSelect(project)}
                  activeOpacity={0.7}
                >
                  <AppCard style={styles.projectCard}>
                    <View style={styles.projectIconWrapper}>
                      <AppText style={styles.projectIcon}>📁</AppText>
                    </View>
                    <View style={styles.projectInfo}>
                      <AppText style={styles.projectName} numberOfLines={1}>
                        {project.name}
                      </AppText>
                      <AppText style={styles.projectPath} numberOfLines={1}>
                        {project.path}
                      </AppText>
                    </View>
                    <AppText style={styles.projectTime}>
                      {getTimeAgo(project.lastOpened)}
                    </AppText>
                  </AppCard>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Empty State */}
          {!isLoadingProjects && (!projects || projects.length === 0) && (
            <View style={styles.emptyState}>
              <AppText style={styles.emptyIcon}>📂</AppText>
              <AppText style={styles.emptyTitle}>No Projects Yet</AppText>
              <AppText style={styles.emptyText}>
                Your recently opened projects will appear here.
              </AppText>
            </View>
          )}

          {/* Help Text */}
          <View style={styles.helpContainer}>
            <AppText style={styles.helpText}>
              To open a new project, tap the {'{ }'} button in the Terminal while navigated to your project directory.
            </AppText>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Editor View
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackToHistory}>
          <AppText style={styles.backButtonText}>← Projects</AppText>
        </TouchableOpacity>
        <AppText style={styles.headerTitle} numberOfLines={1}>
          {currentProject?.name || 'Editor'}
        </AppText>
        {activeFile && dirtyFiles.has(activeFile) && (
          <TouchableOpacity style={styles.saveButton} onPress={() => handleSaveFile()}>
            <AppText style={styles.saveButtonText}>Save</AppText>
          </TouchableOpacity>
        )}
      </View>

      {/* Editor Tabs */}
      {openFiles.length > 0 && (
        <EditorTabs
          files={openFiles}
          activeFile={activeFile}
          onSelectFile={setActiveFile}
          onCloseFile={handleCloseFile}
        />
      )}

      {/* Main Content */}
      <View style={styles.editorContent}>
        {/* File Tree Sidebar */}
        <View style={styles.sidebar}>
          <View style={styles.sidebarHeader}>
            <AppText style={styles.sidebarTitle}>Files</AppText>
          </View>
          {currentProject && (
            <FileTree
              rootPath={currentProject.path}
              initialChildren={currentProject.rootChildren}
              onFileSelect={handleFileSelect}
              selectedFile={activeFile}
            />
          )}
        </View>

        {/* Editor Area */}
        <View style={styles.editorArea}>
          {activeFile ? (
            <CodeEditor
              content={fileContents[activeFile] || ''}
              language={getLanguage(activeFile)}
              onContentChange={handleContentChange}
              onSave={() => handleSaveFile()}
              loading={isLoadingFile}
            />
          ) : (
            <View style={styles.noFileSelected}>
              <AppText style={styles.noFileIcon}>📄</AppText>
              <AppText style={styles.noFileText}>
                Select a file from the sidebar to start editing
              </AppText>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 6,
  },
  saveButtonText: {
    fontSize: 14,
    color: colors.text.inverse,
    fontWeight: '600',
  },

  // History View
  historyContainer: {
    flex: 1,
  },
  historyContent: {
    padding: 16,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  projectsList: {
    gap: 8,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
  },
  projectIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  projectIcon: {
    fontSize: 22,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  projectPath: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  projectTime: {
    fontSize: 12,
    color: colors.text.disabled,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },

  // Help Container
  helpContainer: {
    marginTop: 32,
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  helpText: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.text.secondary,
  },

  // Editor View
  editorContent: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 200,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  sidebarHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sidebarTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editorArea: {
    flex: 1,
  },
  noFileSelected: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 32,
  },
  noFileIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  noFileText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
