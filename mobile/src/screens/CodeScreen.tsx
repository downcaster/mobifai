import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { CodeEditor } from "../components/code/CodeEditor";
import { FileTree, SelectedItem } from "../components/code/FileTree";
import { EditorTabs, OpenFile } from "../components/code/EditorTabs";
import { CodeProject, FileNode } from "../types/code";
import {
  useInitProject,
  useFileContent,
  useSaveFile,
  useProjectsHistory,
} from "../hooks/useCodeQueries";
import { codeService, FileDiff } from "../services/CodeService";
import { DiffMode } from "../components/code/CodeEditor";
import { useQueryClient } from "@tanstack/react-query";
import { useIsConnected } from "../services/ConnectionContext";
import { MainTabParamList } from "../navigation/MainTabNavigator";
import { AppView, AppText, AppButton } from "../components/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RELAY_SERVER_URL } from "../config";
import { getThemeById, TerminalTheme } from "../theme/terminalThemes";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SIDEBAR_WIDTH = 280;

// Dark theme colors (matching terminal)
const darkTheme = {
  background: "#0a0a0f",
  surface: "#12121a",
  surfaceElevated: "#1a1a25",
  border: "#2a2a3a",
  primary: "#6200EE",
  primaryLight: "#BB86FC",
  secondary: "#03DAC6",
  text: {
    primary: "#ffffff",
    secondary: "#8888aa",
    disabled: "#555566",
  },
  error: "#CF6679",
};

interface ProjectState {
  path: string;
  name: string;
  rootChildren: FileNode[];
}

type ViewMode = "history" | "editor";
type CreateMode = "file" | "folder" | null;

export default function CodeScreen(): React.ReactElement {
  const queryClient = useQueryClient();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const isConnected = useIsConnected();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("history");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnim = useRef(new Animated.Value(0)).current;

  // Create modal state
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [createName, setCreateName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Project state - MUST be declared before any conditional returns
  const [currentProject, setCurrentProject] = useState<ProjectState | null>(
    null
  );
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());

  // Selected item state (for file/folder creation)
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);

  // Diff state (loaded from settings)
  const [diffMode, setDiffMode] = useState<DiffMode>("off");
  const [diffData, setDiffData] = useState<FileDiff | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  // Editor settings (from user preferences)
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [editorTheme, setEditorTheme] = useState<TerminalTheme | null>(null);

  // Context menu state (for long press)
  const [contextMenuItem, setContextMenuItem] = useState<SelectedItem | null>(
    null
  );

  // Rename modal state
  const [renameItem, setRenameItem] = useState<SelectedItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete confirmation state
  const [deleteItem, setDeleteItem] = useState<SelectedItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sidebar tabs state
  const [sidebarTab, setSidebarTab] = useState<"files" | "changes">("files");
  const [projectChanges, setProjectChanges] = useState<{
    staged: Array<{ path: string; type: string }>;
    unstaged: Array<{ path: string; type: string }>;
  }>({ staged: [], unstaged: [] });

  // Queries - MUST be called before any conditional returns
  const { data: projects, isLoading: isLoadingProjects } = useProjectsHistory();
  const initProjectMutation = useInitProject();
  const saveFileMutation = useSaveFile();

  // Fetch active file content
  const { data: activeFileContent, isLoading: isLoadingFile } =
    useFileContent(activeFile, currentProject?.path);

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
            onPress={() => navigation.navigate("Connections")}
            style={notConnectedStyles.button}
          />
        </View>
      </AppView>
    );
  }

  // Fetch editor settings when screen comes into focus (to pick up changes from Profile)
  useFocusEffect(
    useCallback(() => {
      const fetchEditorSettings = async () => {
        try {
          const token = await AsyncStorage.getItem("mobifai_auth_token");
          if (!token) return;

          const response = await fetch(`${RELAY_SERVER_URL}/api/settings`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.fontSize) {
              setEditorFontSize(data.fontSize);
            }
            if (data.codeTheme) {
              setEditorTheme(getThemeById(data.codeTheme));
            }
            if (data.codeDiffMode) {
              setDiffMode(data.codeDiffMode as DiffMode);
            }
          }
        } catch (error) {
          console.error("Error fetching editor settings:", error);
        }
      };

      fetchEditorSettings();
    }, [])
  );

  // Update file content when loaded
  useEffect(() => {
    // Only set content if the file isn't already in fileContents
    // Use 'in' operator to check key existence (handles empty string content)
    if (
      activeFile &&
      activeFileContent !== undefined &&
      !(activeFile in fileContents)
    ) {
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
    const handleOpenProject = codeService.onMessage(
      "code:projectInitialized",
      (_action, payload) => {
        if (payload.rootPath) {
          const projectName = payload.rootPath.split("/").pop() || "Project";
          setCurrentProject({
            path: payload.rootPath,
            name: projectName,
            rootChildren: payload.children || [],
          });
          setViewMode("editor");
          // Select root folder by default
          setSelectedItem({
            path: payload.rootPath,
            type: "folder",
            name: projectName,
          });

          queryClient.setQueryData<CodeProject[]>(["projects"], (old) => {
            const newProject: CodeProject = {
              path: payload.rootPath,
              name: projectName,
              lastOpened: Date.now(),
            };
            if (!old) return [newProject];
            const filtered = old.filter((p) => p.path !== payload.rootPath);
            return [newProject, ...filtered];
          });
        }
      }
    );

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
        setViewMode("editor");
        // Select root folder by default
        setSelectedItem({
          path: result.rootPath,
          type: "folder",
          name: project.name,
        });
        
        // Sync open files from Mac client for this project
        try {
          const syncedState = await codeService.syncOpenFiles(project.path);
          if (syncedState.files && syncedState.files.length > 0) {
            // Restore open file tabs
            const restoredFiles: OpenFile[] = syncedState.files.map((file: { path: string; content: string; isActive: boolean }) => ({
              path: file.path,
              name: file.path.split("/").pop() || file.path,
              isDirty: false,
            }));
            setOpenFiles(restoredFiles);
            
            // Restore active file and its content
            const activeFileData = syncedState.files.find((f: { path: string; content: string; isActive: boolean }) => f.isActive);
            if (activeFileData) {
              setActiveFile(activeFileData.path);
              setFileContents({ [activeFileData.path]: activeFileData.content });
              // Notify Mac client
              try {
                await codeService.setActiveFile(activeFileData.path);
              } catch (error) {
                console.error("Failed to set active file on Mac:", error);
              }
            } else if (restoredFiles.length > 0) {
              // No active file saved, auto-open the first tab
              const firstFile = restoredFiles[0];
              setActiveFile(firstFile.path);
              const firstFileData = syncedState.files[0];
              setFileContents({ [firstFile.path]: firstFileData.content });
              // Notify Mac client
              try {
                await codeService.setActiveFile(firstFile.path);
              } catch (error) {
                console.error("Failed to set active file on Mac:", error);
              }
              console.log(`📂 Auto-opened first file: ${firstFile.name}`);
            }
            console.log(`✅ Restored ${syncedState.files.length} open file(s)`);
          }
        } catch (syncError) {
          console.error("Failed to sync open files:", syncError);
          // Non-critical error, continue
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        Alert.alert("Error", `Failed to open project: ${errorMessage}`);
      }
    },
    [initProjectMutation]
  );

  // Handle file selection from tree
  const handleFileSelect = useCallback(
    async (filePath: string) => {
      const fileName = filePath.split("/").pop() || filePath;

      const existingFile = openFiles.find((f) => f.path === filePath);
      if (existingFile) {
        setActiveFile(filePath);
        // Notify Mac client about active file change
        try {
          await codeService.setActiveFile(filePath);
        } catch (error) {
          console.error("Failed to set active file on Mac:", error);
        }
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
      // Notify Mac client about active file change
      try {
        await codeService.setActiveFile(filePath);
      } catch (error) {
        console.error("Failed to set active file on Mac:", error);
      }
      closeSidebar();
    },
    [openFiles, closeSidebar]
  );

  // Handle item selection (for file/folder creation context)
  const handleItemSelect = useCallback((item: SelectedItem | null) => {
    setSelectedItem(item);
  }, []);

  // Handle long press on item (show context menu)
  const handleItemLongPress = useCallback((item: SelectedItem) => {
    setContextMenuItem(item);
  }, []);

  // Handle file close
  const handleCloseFile = useCallback(
    (filePath: string) => {
      const isDirty = dirtyFiles.has(filePath);

      if (isDirty) {
        Alert.alert(
          "Unsaved Changes",
          "Do you want to save changes before closing?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Don't Save",
              style: "destructive",
              onPress: () => performCloseFile(filePath),
            },
            {
              text: "Save",
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

      const originalContent = activeFileContent || "";
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
        prev.map((f) => (f.path === activeFile ? { ...f, isDirty } : f))
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
          prev.map((f) =>
            f.path === pathToSave ? { ...f, isDirty: false } : f
          )
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        Alert.alert("Error", `Failed to save file: ${errorMessage}`);
      }
    },
    [activeFile, fileContents, saveFileMutation]
  );

  // Get target folder for creation
  const getTargetFolder = (): string | null => {
    if (!currentProject) return null;

    if (!selectedItem) {
      return currentProject.path; // Default to root
    }

    if (selectedItem.type === "folder") {
      return selectedItem.path;
    }

    // If file is selected, get parent folder
    const pathParts = selectedItem.path.split("/");
    pathParts.pop(); // Remove file name
    return pathParts.join("/");
  };

  // Handle create file
  const handleCreateFile = useCallback(() => {
    setCreateMode("file");
    setCreateName("");
  }, []);

  // Handle create folder
  const handleCreateFolder = useCallback(() => {
    setCreateMode("folder");
    setCreateName("");
  }, []);

  // Handle create submit
  const handleCreateSubmit = useCallback(async () => {
    if (!createName.trim() || !currentProject) return;

    const targetFolder = getTargetFolder();
    if (!targetFolder) return;

    setIsCreating(true);

    try {
      if (createMode === "file") {
        const result = await codeService.createFile(
          targetFolder,
          createName.trim()
        );

        // Update the project's children if we created in root
        if (targetFolder === currentProject.path) {
          setCurrentProject((prev) =>
            prev
              ? {
                  ...prev,
                  rootChildren: result.children,
                }
              : null
          );
        }

        // Invalidate folder queries to refresh the tree
        queryClient.invalidateQueries({
          queryKey: ["folderChildren", targetFolder],
        });

        // Optionally open the new file
        handleFileSelect(result.filePath);
      } else if (createMode === "folder") {
        const result = await codeService.createFolder(
          targetFolder,
          createName.trim()
        );

        // Update the project's children if we created in root
        if (targetFolder === currentProject.path) {
          setCurrentProject((prev) =>
            prev
              ? {
                  ...prev,
                  rootChildren: result.children,
                }
              : null
          );
        }

        // Invalidate folder queries to refresh the tree
        queryClient.invalidateQueries({
          queryKey: ["folderChildren", targetFolder],
        });
      }

      setCreateMode(null);
      setCreateName("");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", `Failed to create ${createMode}: ${errorMessage}`);
    } finally {
      setIsCreating(false);
    }
  }, [createMode, createName, currentProject, queryClient, handleFileSelect]);

  // Handle rename - open rename modal
  const handleOpenRename = useCallback(() => {
    if (contextMenuItem) {
      setRenameItem(contextMenuItem);
      setRenameName(contextMenuItem.name);
      setContextMenuItem(null);
    }
  }, [contextMenuItem]);

  // Handle rename submit
  const handleRenameSubmit = useCallback(async () => {
    if (!renameName.trim() || !renameItem || !currentProject) return;

    setIsRenaming(true);

    try {
      const result = await codeService.renameItem(
        renameItem.path,
        renameName.trim()
      );

      const parentFolder = result.parentFolder;

      // Update the project's children if renamed in root
      if (parentFolder === currentProject.path) {
        setCurrentProject((prev) =>
          prev
            ? {
                ...prev,
                rootChildren: result.children,
              }
            : null
        );
      }

      // Invalidate folder queries to refresh the tree
      queryClient.invalidateQueries({
        queryKey: ["folderChildren", parentFolder],
      });

      // Update open files if the renamed item was open
      if (renameItem.type === "file") {
        setOpenFiles((prev) =>
          prev.map((f) => {
            if (f.path === renameItem.path) {
              return { ...f, path: result.newPath, name: renameName.trim() };
            }
            return f;
          })
        );

        // Update active file if it was the renamed file
        if (activeFile === renameItem.path) {
          setActiveFile(result.newPath);
        }

        // Update file contents
        if (renameItem.path in fileContents) {
          setFileContents((prev) => {
            const newContents = { ...prev };
            newContents[result.newPath] = newContents[renameItem.path];
            delete newContents[renameItem.path];
            return newContents;
          });
        }

        // Update dirty files
        if (dirtyFiles.has(renameItem.path)) {
          setDirtyFiles((prev) => {
            const newDirty = new Set(prev);
            newDirty.delete(renameItem.path);
            newDirty.add(result.newPath);
            return newDirty;
          });
        }
      }

      // Update selected item
      if (selectedItem?.path === renameItem.path) {
        setSelectedItem({
          ...renameItem,
          path: result.newPath,
          name: renameName.trim(),
        });
      }

      setRenameItem(null);
      setRenameName("");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", `Failed to rename: ${errorMessage}`);
    } finally {
      setIsRenaming(false);
    }
  }, [
    renameName,
    renameItem,
    currentProject,
    queryClient,
    activeFile,
    fileContents,
    dirtyFiles,
    selectedItem,
  ]);

  // Handle delete - open delete confirmation
  const handleOpenDelete = useCallback(() => {
    if (contextMenuItem) {
      setDeleteItem(contextMenuItem);
      setContextMenuItem(null);
    }
  }, [contextMenuItem]);

  // Handle delete confirm
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteItem || !currentProject) return;

    setIsDeleting(true);

    try {
      const result = await codeService.deleteItem(deleteItem.path);

      const parentFolder = result.parentFolder;

      // Update the project's children if deleted from root
      if (parentFolder === currentProject.path) {
        setCurrentProject((prev) =>
          prev
            ? {
                ...prev,
                rootChildren: result.children,
              }
            : null
        );
      }

      // Invalidate folder queries to refresh the tree
      queryClient.invalidateQueries({
        queryKey: ["folderChildren", parentFolder],
      });

      // Close the file if it was open
      if (
        deleteItem.type === "file" &&
        openFiles.some((f) => f.path === deleteItem.path)
      ) {
        performCloseFile(deleteItem.path);
      }

      // If a folder was deleted, close all files inside it
      if (deleteItem.type === "folder") {
        const deletedPath = deleteItem.path + "/";
        openFiles.forEach((f) => {
          if (f.path.startsWith(deletedPath)) {
            performCloseFile(f.path);
          }
        });
      }

      // Clear selected item if it was deleted
      if (
        selectedItem?.path === deleteItem.path ||
        (deleteItem.type === "folder" &&
          selectedItem?.path.startsWith(deleteItem.path + "/"))
      ) {
        setSelectedItem(null);
      }

      setDeleteItem(null);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", `Failed to delete: ${errorMessage}`);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteItem, currentProject, queryClient, openFiles, selectedItem]);

  // Fetch diff data for the active file
  const fetchDiffData = useCallback(async (filePath: string) => {
    if (!filePath) {
      setDiffData(null);
      return;
    }

    setIsLoadingDiff(true);
    try {
      const diff = await codeService.getFileDiff(filePath);
      setDiffData(diff);
    } catch (error) {
      console.error("Failed to fetch diff:", error);
      setDiffData(null);
    } finally {
      setIsLoadingDiff(false);
    }
  }, []);

  // Fetch diff when active file changes or diff mode is enabled
  useEffect(() => {
    if (activeFile && diffMode !== "off") {
      fetchDiffData(activeFile);
    } else {
      setDiffData(null);
    }
  }, [activeFile, diffMode, fetchDiffData]);

  // Fetch project changes when project changes or tab switches to changes
  useEffect(() => {
    if (currentProject?.path && sidebarTab === "changes") {
      codeService
        .getProjectChanges(currentProject.path)
        .then((changes) => setProjectChanges(changes))
        .catch((err) => console.error("Failed to fetch project changes:", err));
    }
  }, [currentProject?.path, sidebarTab]);

  // Listen for file updates from Mac (when file changes on disk)
  // Listen for file updates from Mac
  useEffect(() => {
    const unsubscribe = codeService.onMessage(
      "code:fileUpdated",
      (_action, payload: { filePath: string; content: string }) => {
        // Only update if this is the active file
        if (payload.filePath === activeFile) {
          console.log("📝 File updated from Mac:", payload.filePath);
          setFileContents((prev) => ({
            ...prev,
            [payload.filePath]: payload.content,
          }));
        }
      }
    );

    return () => unsubscribe();
  }, [activeFile]);

  // Listen for diff updates from Mac (sent automatically after file changes)
  useEffect(() => {
    const unsubscribe = codeService.onMessage(
      "code:fileDiff",
      (_action, payload: FileDiff) => {
        // Only update if this is the active file and diff mode is enabled
        if (payload.filePath === activeFile && diffMode !== "off") {
          console.log("📊 Received live diff update from Mac:", payload.filePath);
          console.log(`   Added: ${payload.addedLines.length}, Deleted: ${payload.deletedLines.length}, Modified: ${payload.modifiedLines.length}`);
          setDiffData(payload);
        }
      }
    );

    return () => unsubscribe();
  }, [activeFile, diffMode]);

  // Get language from file path
  const getLanguage = (filePath: string): string => {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      py: "python",
      json: "json",
      html: "html",
      css: "css",
      md: "markdown",
    };
    return langMap[ext || ""] || "javascript";
  };

  // Go back to history
  const handleBackToHistory = () => {
    setViewMode("history");
    setCurrentProject(null);
    setOpenFiles([]);
    setActiveFile(null);
    setFileContents({});
    setDirtyFiles(new Set());
    setSelectedItem(null);
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
    return "Just now";
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

  // Get selected folder name for display
  const getSelectedFolderName = (): string => {
    if (!selectedItem) return currentProject?.name || "root";
    if (selectedItem.type === "folder") {
      return selectedItem.path.split("/").pop() || "root";
    }
    // If file, show parent folder
    const pathParts = selectedItem.path.split("/");
    pathParts.pop();
    return pathParts.pop() || "root";
  };

  // History View
  if (viewMode === "history") {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Code Editor</Text>
        </View>

        <ScrollView
          style={styles.historyContainer}
          contentContainerStyle={styles.historyContent}
        >
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
              To open a new project, tap the {"{ }"} button in the Terminal
              while navigated to your project directory.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Editor View
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackToHistory}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuButton}
          onPress={toggleSidebar}
          activeOpacity={0.7}
        >
          <View style={styles.hamburger}>
            <View
              style={[
                styles.hamburgerLine,
                sidebarOpen && styles.hamburgerLineActive,
              ]}
            />
            <View
              style={[
                styles.hamburgerLine,
                sidebarOpen && styles.hamburgerLineActive,
              ]}
            />
            <View
              style={[
                styles.hamburgerLine,
                sidebarOpen && styles.hamburgerLineActive,
              ]}
            />
          </View>
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentProject?.name || "Editor"}
        </Text>

        {activeFile && dirtyFiles.has(activeFile) && (
          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => handleSaveFile()}
          >
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Editor Tabs */}
      <EditorTabs
        files={openFiles}
        activeFile={activeFile}
        onSelectFile={async (filePath) => {
          setActiveFile(filePath);
          // Notify Mac client about active file change
          try {
            await codeService.setActiveFile(filePath);
          } catch (error) {
            console.error("Failed to set active file on Mac:", error);
          }
        }}
        onCloseFile={handleCloseFile}
        fontSize={editorFontSize}
      />

      {/* Main Content */}
      <View style={styles.editorContent}>
        {/* Editor Area */}
        {activeFile ? (
          <CodeEditor
            content={fileContents[activeFile] || ""}
            language={getLanguage(activeFile)}
            onContentChange={handleContentChange}
            onSave={() => handleSaveFile()}
            loading={isLoadingFile}
            diffMode={diffMode}
            diffData={diffData}
            fontSize={editorFontSize}
            theme={editorTheme}
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
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
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
            { transform: [{ translateX: sidebarTranslateX }] },
          ]}
        >
          {/* Sidebar Header with tabs and actions */}
          <View style={styles.sidebarHeader}>
            <View style={styles.sidebarTabs}>
              <TouchableOpacity
                style={[
                  styles.sidebarTab,
                  sidebarTab === "files" && styles.sidebarTabActive,
                ]}
                onPress={() => setSidebarTab("files")}
              >
                <Text
                  style={[
                    styles.sidebarTabText,
                    sidebarTab === "files" && styles.sidebarTabTextActive,
                  ]}
                >
                  Files
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sidebarTab,
                  sidebarTab === "changes" && styles.sidebarTabActive,
                ]}
                onPress={() => setSidebarTab("changes")}
              >
                <Text
                  style={[
                    styles.sidebarTabText,
                    sidebarTab === "changes" && styles.sidebarTabTextActive,
                  ]}
                >
                  Changes
                </Text>
                {projectChanges.staged.length + projectChanges.unstaged.length >
                  0 && (
                  <View style={styles.changesBadge}>
                    <Text style={styles.changesBadgeText}>
                      {projectChanges.staged.length +
                        projectChanges.unstaged.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.sidebarActions}>
              {sidebarTab === "files" && (
                <>
                  <TouchableOpacity
                    onPress={handleCreateFile}
                    style={styles.createButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.createButtonText}>+📄</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreateFolder}
                    style={styles.createButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.createButtonText}>+📁</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                onPress={closeSidebar}
                style={styles.closeSidebar}
              >
                <Text style={styles.closeSidebarText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Files Tab Content */}
          {sidebarTab === "files" && (
            <>
              {/* Selected folder indicator */}
              {selectedItem && (
                <View style={styles.selectedIndicator}>
                  <Text style={styles.selectedIndicatorText}>
                    Selected: {selectedItem.type === "folder" ? "📁" : "📄"}{" "}
                    {selectedItem.name}
                  </Text>
                </View>
              )}

              {currentProject && (
                <FileTree
                  rootPath={currentProject.path}
                  initialChildren={currentProject.rootChildren}
                  onFileSelect={handleFileSelect}
                  onItemSelect={handleItemSelect}
                  onItemLongPress={handleItemLongPress}
                  selectedFile={activeFile}
                  selectedItem={selectedItem}
                />
              )}
            </>
          )}

          {/* Changes Tab Content */}
          {sidebarTab === "changes" && (
            <ScrollView style={styles.changesContainer}>
              {/* Staged Changes */}
              {projectChanges.staged.length > 0 && (
                <View style={styles.changesSection}>
                  <Text style={styles.changesSectionTitle}>STAGED</Text>
                  {projectChanges.staged.map((change) => (
                    <TouchableOpacity
                      key={change.path}
                      style={styles.changeItem}
                      onPress={() => handleFileSelect(change.path)}
                    >
                      <View
                        style={[
                          styles.changeTypeIndicator,
                          styles.changeTypeStaged,
                        ]}
                      />
                      <Text style={styles.changeTypeBadge}>{change.type}</Text>
                      <Text style={styles.changeFileName} numberOfLines={1}>
                        {change.path.split("/").pop()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Unstaged Changes */}
              {projectChanges.unstaged.length > 0 && (
                <View style={styles.changesSection}>
                  <Text style={styles.changesSectionTitle}>UNSTAGED</Text>
                  {projectChanges.unstaged.map((change) => (
                    <TouchableOpacity
                      key={change.path}
                      style={styles.changeItem}
                      onPress={() => handleFileSelect(change.path)}
                    >
                      <View
                        style={[
                          styles.changeTypeIndicator,
                          change.type === "A"
                            ? styles.changeTypeAdded
                            : change.type === "M"
                            ? styles.changeTypeModified
                            : change.type === "D"
                            ? styles.changeTypeDeleted
                            : styles.changeTypeModified,
                        ]}
                      />
                      <Text style={styles.changeTypeBadge}>{change.type}</Text>
                      <Text style={styles.changeFileName} numberOfLines={1}>
                        {change.path.split("/").pop()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Empty State */}
              {projectChanges.staged.length === 0 &&
                projectChanges.unstaged.length === 0 && (
                  <View style={styles.changesEmpty}>
                    <Text style={styles.changesEmptyIcon}>✓</Text>
                    <Text style={styles.changesEmptyText}>No changes</Text>
                    <Text style={styles.changesEmptySubtext}>
                      Working tree is clean
                    </Text>
                  </View>
                )}
            </ScrollView>
          )}
        </Animated.View>
      </View>

      {/* Context Menu Modal (Long Press) */}
      <Modal
        visible={contextMenuItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenuItem(null)}
      >
        <TouchableOpacity
          style={styles.contextMenuOverlay}
          activeOpacity={1}
          onPress={() => setContextMenuItem(null)}
        >
          <View style={styles.contextMenu}>
            <Text style={styles.contextMenuTitle} numberOfLines={1}>
              {contextMenuItem?.type === "folder" ? "📁" : "📄"}{" "}
              {contextMenuItem?.name}
            </Text>
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={handleOpenRename}
            >
              <Text style={styles.contextMenuIcon}>✏️</Text>
              <Text style={styles.contextMenuText}>Rename</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contextMenuItem, styles.contextMenuItemDanger]}
              onPress={handleOpenDelete}
            >
              <Text style={styles.contextMenuIcon}>🗑️</Text>
              <Text
                style={[styles.contextMenuText, styles.contextMenuTextDanger]}
              >
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create File/Folder Modal */}
      <Modal
        visible={createMode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateMode(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setCreateMode(null)}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Create New {createMode === "file" ? "File" : "Folder"}
            </Text>
            <Text style={styles.modalSubtitle}>
              in {getSelectedFolderName()}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={
                createMode === "file" ? "filename.txt" : "folder-name"
              }
              placeholderTextColor={darkTheme.text.disabled}
              value={createName}
              onChangeText={setCreateName}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setCreateMode(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalCreateButton,
                  (!createName.trim() || isCreating) &&
                    styles.modalButtonDisabled,
                ]}
                onPress={handleCreateSubmit}
                disabled={!createName.trim() || isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalCreateText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={renameItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameItem(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setRenameItem(null)}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Rename {renameItem?.type === "folder" ? "Folder" : "File"}
            </Text>
            <Text style={styles.modalSubtitle}>
              {renameItem?.type === "folder" ? "📁" : "📄"} {renameItem?.name}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="New name"
              placeholderTextColor={darkTheme.text.disabled}
              value={renameName}
              onChangeText={setRenameName}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              selectTextOnFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setRenameItem(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalCreateButton,
                  (!renameName.trim() ||
                    isRenaming ||
                    renameName.trim() === renameItem?.name) &&
                    styles.modalButtonDisabled,
                ]}
                onPress={handleRenameSubmit}
                disabled={
                  !renameName.trim() ||
                  isRenaming ||
                  renameName.trim() === renameItem?.name
                }
              >
                {isRenaming ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalCreateText}>Rename</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteItem(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setDeleteItem(null)}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Delete {deleteItem?.type === "folder" ? "Folder" : "File"}?
            </Text>
            <Text style={styles.deleteWarning}>
              {deleteItem?.type === "folder"
                ? "This will delete the folder and all its contents. This action cannot be undone."
                : "This action cannot be undone."}
            </Text>
            <View style={styles.deleteItemPreview}>
              <Text style={styles.deleteItemIcon}>
                {deleteItem?.type === "folder" ? "📁" : "📄"}
              </Text>
              <Text style={styles.deleteItemName} numberOfLines={1}>
                {deleteItem?.name}
              </Text>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setDeleteItem(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalDeleteButton,
                  isDeleting && styles.modalButtonDisabled,
                ]}
                onPress={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalDeleteText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 56,
    backgroundColor: darkTheme.background,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: darkTheme.text.primary,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: darkTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: darkTheme.border,
    justifyContent: "center",
    alignItems: "center",
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
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  hamburger: {
    width: 18,
    height: 14,
    justifyContent: "space-between",
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
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  saveButtonText: {
    fontSize: 13,
    color: darkTheme.text.primary,
    fontWeight: "600",
    lineHeight: 15,
    includeFontPadding: false,
    textAlignVertical: "center",
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
    fontWeight: "600",
    color: darkTheme.text.secondary,
    letterSpacing: 1,
  },
  projectsList: {
    gap: 8,
  },
  projectCard: {
    flexDirection: "row",
    alignItems: "center",
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
    backgroundColor: darkTheme.primary + "25",
    justifyContent: "center",
    alignItems: "center",
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
    fontWeight: "600",
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
    alignItems: "center",
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: darkTheme.text.primary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: darkTheme.text.secondary,
    textAlign: "center",
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
    textAlign: "center",
    lineHeight: 20,
  },

  // Loading
  loadingContainer: {
    alignItems: "center",
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
    position: "relative",
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 10,
  },

  // Sidebar
  sidebar: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: darkTheme.surface,
    borderRightWidth: 1,
    borderRightColor: darkTheme.border,
    zIndex: 20,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
  },
  sidebarTabs: {
    flexDirection: "row",
    gap: 4,
  },
  sidebarTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  sidebarTabActive: {
    backgroundColor: darkTheme.primary + "25",
  },
  sidebarTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: darkTheme.text.secondary,
  },
  sidebarTabTextActive: {
    color: darkTheme.primaryLight,
  },
  changesBadge: {
    marginLeft: 6,
    backgroundColor: darkTheme.primary,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  changesBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: darkTheme.text.primary,
  },
  sidebarTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: darkTheme.text.secondary,
    letterSpacing: 1,
  },
  sidebarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  createButton: {
    width: 32,
    height: 28,
    borderRadius: 6,
    backgroundColor: darkTheme.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
  },
  createButtonText: {
    fontSize: 12,
  },
  closeSidebar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: darkTheme.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 4,
  },
  closeSidebarText: {
    fontSize: 14,
    color: darkTheme.text.secondary,
  },
  selectedIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: darkTheme.primary + "15",
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
  },
  selectedIndicatorText: {
    fontSize: 11,
    color: darkTheme.text.secondary,
  },

  // Changes List
  changesContainer: {
    flex: 1,
  },
  changesSection: {
    paddingTop: 12,
  },
  changesSectionTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: darkTheme.text.secondary,
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  changeItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  changeTypeIndicator: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    marginRight: 8,
  },
  changeTypeStaged: {
    backgroundColor: "#4CAF50",
  },
  changeTypeAdded: {
    backgroundColor: "#4CAF50",
  },
  changeTypeModified: {
    backgroundColor: "#2196F3",
  },
  changeTypeDeleted: {
    backgroundColor: "#F44336",
  },
  changeTypeBadge: {
    fontSize: 10,
    fontWeight: "600",
    color: darkTheme.text.secondary,
    backgroundColor: darkTheme.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
    minWidth: 18,
    textAlign: "center",
  },
  changeFileName: {
    flex: 1,
    fontSize: 13,
    color: darkTheme.text.primary,
  },
  changesEmpty: {
    alignItems: "center",
    paddingVertical: 48,
  },
  changesEmptyIcon: {
    fontSize: 32,
    color: "#4CAF50",
    marginBottom: 12,
  },
  changesEmptyText: {
    fontSize: 14,
    fontWeight: "600",
    color: darkTheme.text.primary,
    marginBottom: 4,
  },
  changesEmptySubtext: {
    fontSize: 12,
    color: darkTheme.text.secondary,
  },

  // No file selected
  noFileSelected: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    textAlign: "center",
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
    fontWeight: "600",
  },

  // Context Menu
  contextMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  contextMenu: {
    width: 200,
    backgroundColor: darkTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkTheme.border,
    overflow: "hidden",
  },
  contextMenuTitle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 13,
    fontWeight: "600",
    color: darkTheme.text.primary,
    backgroundColor: darkTheme.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
  },
  contextMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  contextMenuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: darkTheme.border,
  },
  contextMenuIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  contextMenuText: {
    fontSize: 15,
    color: darkTheme.text.primary,
  },
  contextMenuTextDanger: {
    color: darkTheme.error,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContent: {
    width: SCREEN_WIDTH - 48,
    backgroundColor: darkTheme.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: darkTheme.text.primary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: darkTheme.text.secondary,
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: darkTheme.background,
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: darkTheme.text.primary,
    borderWidth: 1,
    borderColor: darkTheme.border,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: darkTheme.surfaceElevated,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 15,
    color: darkTheme.text.secondary,
    fontWeight: "600",
  },
  modalCreateButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: darkTheme.primary,
    alignItems: "center",
  },
  modalCreateText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  modalDeleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: darkTheme.error,
    alignItems: "center",
  },
  modalDeleteText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
  deleteWarning: {
    fontSize: 14,
    color: darkTheme.text.secondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  deleteItemPreview: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: darkTheme.background,
    borderRadius: 8,
    marginBottom: 20,
  },
  deleteItemIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  deleteItemName: {
    flex: 1,
    fontSize: 14,
    color: darkTheme.text.primary,
    fontWeight: "500",
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: darkTheme.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
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
    fontWeight: "700",
    color: darkTheme.text.primary,
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: darkTheme.text.secondary,
    textAlign: "center",
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
