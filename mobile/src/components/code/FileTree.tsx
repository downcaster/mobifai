import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Text,
} from 'react-native';
import { FileNode } from '../../types/code';
import { useFolderChildren } from '../../hooks/useCodeQueries';

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

export interface SelectedItem {
  path: string;
  type: 'file' | 'folder';
  name: string;
}

interface FileTreeProps {
  rootPath: string;
  initialChildren: FileNode[];
  onFileSelect: (path: string) => void;
  onFolderExpand?: (path: string) => void;
  onItemSelect?: (item: SelectedItem | null) => void;
  onItemLongPress?: (item: SelectedItem) => void;
  selectedFile?: string | null;
  selectedItem?: SelectedItem | null;
}

interface TreeNodeProps {
  node: FileNode;
  path: string;
  level: number;
  onFileSelect: (path: string) => void;
  onFolderExpand?: (path: string) => void;
  onItemSelect?: (item: SelectedItem | null) => void;
  onItemLongPress?: (item: SelectedItem) => void;
  selectedFile?: string | null;
  selectedItem?: SelectedItem | null;
}

function TreeNode({
  node,
  path,
  level,
  onFileSelect,
  onFolderExpand,
  onItemSelect,
  onItemLongPress,
  selectedFile,
  selectedItem,
}: TreeNodeProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const fullPath = `${path}/${node.name}`;
  const isFileSelected = selectedFile === fullPath;
  const isItemSelected = selectedItem?.path === fullPath;

  const {
    data: children,
    isLoading,
    error,
  } = useFolderChildren(node.type === 'folder' && isExpanded ? fullPath : null);

  const handlePress = () => {
    // Always select the item when pressed
    if (onItemSelect) {
      onItemSelect({ path: fullPath, type: node.type, name: node.name });
    }

    if (node.type === 'folder') {
      const newExpanded = !isExpanded;
      setIsExpanded(newExpanded);
      if (newExpanded && onFolderExpand) {
        onFolderExpand(fullPath);
      }
    } else {
      onFileSelect(fullPath);
    }
  };

  const handleLongPress = () => {
    if (onItemLongPress) {
      onItemLongPress({ path: fullPath, type: node.type, name: node.name });
    }
  };

  // Get icon for file/folder
  const getIcon = (): string => {
    if (node.type === 'folder') {
      return isExpanded ? '📂' : '📁';
    }
    
    const ext = node.name.split('.').pop()?.toLowerCase();
    const iconMap: Record<string, string> = {
      'js': '📜',
      'jsx': '⚛️',
      'ts': '📘',
      'tsx': '⚛️',
      'json': '📋',
      'md': '📝',
      'py': '🐍',
      'html': '🌐',
      'css': '🎨',
      'txt': '📄',
    };
    return iconMap[ext || ''] || '📄';
  };

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.nodeContainer,
          { paddingLeft: 12 + level * 16 },
          (isFileSelected || isItemSelected) && styles.nodeSelected,
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={400}
        activeOpacity={0.6}
      >
        {node.type === 'folder' && (
          <Text style={styles.chevron}>
            {isExpanded ? '▾' : '▸'}
          </Text>
        )}
        <Text style={styles.nodeIcon}>{getIcon()}</Text>
        <Text
          style={[styles.nodeName, (isFileSelected || isItemSelected) && styles.nodeNameSelected]}
          numberOfLines={1}
        >
          {node.name}
        </Text>
        {isLoading && (
          <ActivityIndicator size="small" color={darkTheme.primaryLight} style={styles.loader} />
        )}
      </TouchableOpacity>

      {isExpanded && children && (
        <View>
          {children.map((child, index) => (
            <TreeNode
              key={`${child.name}-${index}`}
              node={child}
              path={fullPath}
              level={level + 1}
              onFileSelect={onFileSelect}
              onFolderExpand={onFolderExpand}
              onItemSelect={onItemSelect}
              onItemLongPress={onItemLongPress}
              selectedFile={selectedFile}
              selectedItem={selectedItem}
            />
          ))}
        </View>
      )}

      {isExpanded && error && (
        <View
          style={[
            styles.errorContainer,
            { paddingLeft: 12 + (level + 1) * 16 },
          ]}
        >
          <Text style={styles.errorText}>Failed to load</Text>
        </View>
      )}
    </View>
  );
}

export function FileTree({
  rootPath,
  initialChildren,
  onFileSelect,
  onFolderExpand,
  onItemSelect,
  onItemLongPress,
  selectedFile,
  selectedItem,
}: FileTreeProps): React.ReactElement {
  // Handle tap on background (empty area) to select root
  const handleBackgroundPress = () => {
    if (onItemSelect) {
      const rootName = rootPath.split('/').pop() || 'root';
      onItemSelect({ path: rootPath, type: 'folder', name: rootName });
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
      >
        {initialChildren.map((node, index) => (
          <TreeNode
            key={`${node.name}-${index}`}
            node={node}
            path={rootPath}
            level={0}
            onFileSelect={onFileSelect}
            onFolderExpand={onFolderExpand}
            onItemSelect={onItemSelect}
            onItemLongPress={onItemLongPress}
            selectedFile={selectedFile}
            selectedItem={selectedItem}
          />
        ))}
        {/* Empty spacer at bottom - tappable to select root */}
        <TouchableOpacity 
          style={styles.bottomSpacer}
          onPress={handleBackgroundPress}
          activeOpacity={1}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkTheme.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  bottomSpacer: {
    minHeight: 100,
    flex: 1,
  },
  nodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 12,
    minHeight: 40,
  },
  nodeSelected: {
    backgroundColor: darkTheme.primary + '25',
  },
  chevron: {
    fontSize: 10,
    color: darkTheme.text.secondary,
    width: 14,
    textAlign: 'center',
    marginRight: 4,
  },
  nodeIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  nodeName: {
    flex: 1,
    fontSize: 13,
    color: darkTheme.text.primary,
  },
  nodeNameSelected: {
    color: darkTheme.primaryLight,
    fontWeight: '600',
  },
  loader: {
    marginLeft: 8,
  },
  errorContainer: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  errorText: {
    fontSize: 11,
    color: darkTheme.error,
    fontStyle: 'italic',
  },
});
