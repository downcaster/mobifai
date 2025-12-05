import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CodeEditor } from '../components/code/CodeEditor';
import { FileTree } from '../components/code/FileTree';
import { EditorTabs, OpenFile } from '../components/code/EditorTabs';
import { CodeProject, FileNode } from '../types/code';
import { useInitProject, useFileContent, useSaveFile, useProjectsHistory } from '../hooks/useCodeQueries';
import { codeService } from '../services/CodeService';
import { useQueryClient } from '@tanstack/react-query';
import { useIsConnected } from '../services/ConnectionContext';
import { MainTabParamList } from '../navigation/MainTabNavigator';
import { AppView, AppText, AppButton } from '../components/ui';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDEBAR_WIDTH = 280;

// Dark theme colors (matching terminal)
const darkTheme = {
  background: '#0a0a0f',
  surface: '#12121a',
  surfaceElevated: '#1a1a25',
  border: '#2a2a3a',
  primary: '#6200EE',
  primaryLight: '#BB86FC',
  secondary: '#03DAC6',
  text: {
    primary: '#ffffff',
    secondary: '#8888aa',
    disabled: '#555566',
  },
  error: '#CF6679',
};

interface ProjectState {
  path: string;
  name: string;
  rootChildren: FileNode[];
}

type ViewMode = 'history' | 'editor';

export default function CodeScreen(): React.ReactElement {
  const queryClient = useQueryClient();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const isConnected = useIsConnected();
  
  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('history');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnim = useRef(new Animated.Value(0)).current;

  // Show "No Active Connection" screen when not connected
  if (!isConnected) {
    return (
      <AppView safeArea style={notConnectedStyles.container}>
        <View style={notConnectedStyles.content}>
          <View style={notConnectedStyles.iconContainer}>
            <Text style={notConnectedStyles.icon}>◎</Text>
          </View>
          <AppText variant="h2" weight="bold" style={notConnectedStyles.title}>
            No Active Connection
          </AppText>
          <AppText style={notConnectedStyles.subtitle}>
            Connect to your Mac to browse and edit files
          </AppText>
          <AppButton
            title="Connect to Mac"
            onPress={() => navigation.navigate('Connections')}
            style={notConnectedStyles.button}
          />
        </View>
      </AppView>
    );
  }
  
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

  // Animate sidebar
  const toggleSidebar = useCallback(() => {
    const toValue = sidebarOpen ? 0 : 1;
    Animated.spring(sidebarAnim, {
      toValue,
      useNativeDriver: true,
      friction: 20,
      tension: 80,
    }).start();
    setSidebarOpen(!sidebarOpen);
  }, [sidebarOpen, sidebarAnim]);

  // Close sidebar
  const closeSidebar = useCallback(() => {
    if (sidebarOpen) {
      Animated.spring(sidebarAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 20,
        tension: 80,
      }).start();
      setSidebarOpen(false);
    }
  }, [sidebarOpen, sidebarAnim]);

  // Listen for openProject events from Terminal
  useEffect(() => {
    const handleOpenProject = codeService.onMessage('code:projectInitialized', (_action, payload) => {
      if (payload.rootPath) {
        const projectName = payload.rootPath.split('/').pop() || 'Project';
        setCurrentProject({
          path: payload.rootPath,
          name: projectName,
          rootChildren: payload.children || [],
        });
        setViewMode('editor');
        
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

    const existingFile = openFiles.find((f) => f.path === filePath);
    if (existingFile) {
      setActiveFile(filePath);
      closeSidebar();
      return;
    }

    const newFile: OpenFile = {
      path: filePath,
      name: fileName,
      isDirty: false,
    };
    setOpenFiles((prev) => [...prev, newFile]);
    setActiveFile(filePath);
    closeSidebar();
  }, [openFiles, closeSidebar]);

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
    closeSidebar();
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

  // Sidebar slide animation
  const sidebarTranslateX = sidebarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SIDEBAR_WIDTH, 0],
  });

  const overlayOpacity = sidebarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  // History View
  if (viewMode === 'history') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Code Editor</Text>
        </View>

        <ScrollView style={styles.historyContainer} contentContainerStyle={styles.historyContent}>
          {/* Section Header */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>RECENT PROJECTS</Text>
          </View>

          {/* Loading State */}
          {isLoadingProjects && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={darkTheme.primaryLight} />
              <Text style={styles.loadingText}>Loading projects...</Text>
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
                  style={styles.projectCard}
                >
                  <View style={styles.projectIconWrapper}>
                    <Text style={styles.projectIcon}>📁</Text>
                  </View>
                  <View style={styles.projectInfo}>
                    <Text style={styles.projectName} numberOfLines={1}>
                      {project.name}
                    </Text>
                    <Text style={styles.projectPath} numberOfLines={1}>
                      {project.path}
                    </Text>
                  </View>
                  <Text style={styles.projectTime}>
                    {getTimeAgo(project.lastOpened)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Empty State */}
          {!isLoadingProjects && (!projects || projects.length === 0) && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>No Projects Yet</Text>
              <Text style={styles.emptyText}>
                Your recently opened projects will appear here.
              </Text>
            </View>
          )}

          {/* Help Text */}
          <View style={styles.helpContainer}>
            <Text style={styles.helpText}>
              To open a new project, tap the {'{ }'} button in the Terminal while navigated to your project directory.
            </Text>
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
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.menuButton} 
          onPress={toggleSidebar}
          activeOpacity={0.7}
        >
          <View style={styles.hamburger}>
            <View style={[styles.hamburgerLine, sidebarOpen && styles.hamburgerLineActive]} />
            <View style={[styles.hamburgerLine, sidebarOpen && styles.hamburgerLineActive]} />
            <View style={[styles.hamburgerLine, sidebarOpen && styles.hamburgerLineActive]} />
          </View>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentProject?.name || 'Editor'}
        </Text>
        
        {activeFile && dirtyFiles.has(activeFile) && (
          <TouchableOpacity style={styles.saveButton} onPress={() => handleSaveFile()}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Editor Tabs */}
      <EditorTabs
        files={openFiles}
        activeFile={activeFile}
        onSelectFile={setActiveFile}
        onCloseFile={handleCloseFile}
      />

      {/* Main Content */}
      <View style={styles.editorContent}>
        {/* Editor Area */}
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
            <Text style={styles.noFileIcon}>📄</Text>
            <Text style={styles.noFileText}>
              Select a file to start editing
            </Text>
            <TouchableOpacity 
              style={styles.openFilesButton}
              onPress={toggleSidebar}
            >
              <Text style={styles.openFilesButtonText}>Browse Files</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Overlay when sidebar is open */}
        {sidebarOpen && (
          <Animated.View 
            style={[styles.overlay, { opacity: overlayOpacity }]}
          >
            <TouchableOpacity 
              style={StyleSheet.absoluteFill} 
              onPress={closeSidebar}
              activeOpacity={1}
            />
          </Animated.View>
        )}

        {/* Animated Sidebar */}
        <Animated.View 
          style={[
            styles.sidebar,
            { transform: [{ translateX: sidebarTranslateX }] }
          ]}
        >
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarTitle}>FILES</Text>
            <TouchableOpacity onPress={closeSidebar} style={styles.closeSidebar}>
              <Text style={styles.closeSidebarText}>✕</Text>
            </TouchableOpacity>
          </View>
          {currentProject && (
            <FileTree
              rootPath={currentProject.path}
              initialChildren={currentProject.rootChildren}
              onFileSelect={handleFileSelect}
              selectedFile={activeFile}
            />
          )}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 56,
    backgroundColor: darkTheme.background,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: darkTheme.text.primary,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: darkTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: darkTheme.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 18,
    color: darkTheme.primaryLight,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: darkTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: darkTheme.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  hamburger: {
    width: 18,
    height: 14,
    justifyContent: 'space-between',
  },
  hamburgerLine: {
    width: 18,
    height: 2,
    backgroundColor: darkTheme.primaryLight,
    borderRadius: 1,
  },
  hamburgerLineActive: {
    backgroundColor: darkTheme.secondary,
  },
  saveButton: {
    backgroundColor: darkTheme.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  saveButtonText: {
    fontSize: 13,
    color: darkTheme.text.primary,
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
    fontSize: 12,
    fontWeight: '600',
    color: darkTheme.text.secondary,
    letterSpacing: 1,
  },
  projectsList: {
    gap: 8,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    backgroundColor: darkTheme.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  projectIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: darkTheme.primary + '25',
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
    fontSize: 15,
    fontWeight: '600',
    color: darkTheme.text.primary,
    marginBottom: 4,
  },
  projectPath: {
    fontSize: 12,
    color: darkTheme.text.secondary,
  },
  projectTime: {
    fontSize: 11,
    color: darkTheme.text.disabled,
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
    color: darkTheme.text.primary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: darkTheme.text.secondary,
    textAlign: 'center',
  },

  // Help Container
  helpContainer: {
    marginTop: 32,
    padding: 16,
    backgroundColor: darkTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  helpText: {
    fontSize: 13,
    color: darkTheme.text.secondary,
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
    color: darkTheme.text.secondary,
  },

  // Editor View
  editorContent: {
    flex: 1,
    position: 'relative',
  },
  
  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 10,
  },
  
  // Sidebar
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: darkTheme.surface,
    borderRightWidth: 1,
    borderRightColor: darkTheme.border,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
  },
  sidebarTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: darkTheme.text.secondary,
    letterSpacing: 1,
  },
  closeSidebar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: darkTheme.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeSidebarText: {
    fontSize: 14,
    color: darkTheme.text.secondary,
  },
  
  // No file selected
  noFileSelected: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: darkTheme.background,
    padding: 32,
  },
  noFileIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  noFileText: {
    fontSize: 14,
    color: darkTheme.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  openFilesButton: {
    backgroundColor: darkTheme.surfaceElevated,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  openFilesButtonText: {
    fontSize: 14,
    color: darkTheme.primaryLight,
    fontWeight: '600',
  },
});

// Not Connected styles (matching Terminal screen)
const notConnectedStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: darkTheme.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  icon: {
    fontSize: 48,
    color: darkTheme.primaryLight,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: darkTheme.text.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: darkTheme.text.secondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  button: {
    backgroundColor: darkTheme.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
});
