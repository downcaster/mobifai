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

interface FileTreeProps {
  rootPath: string;
  initialChildren: FileNode[];
  onFileSelect: (path: string) => void;
  onFolderExpand?: (path: string) => void;
  selectedFile?: string | null;
}

interface TreeNodeProps {
  node: FileNode;
  path: string;
  level: number;
  onFileSelect: (path: string) => void;
  onFolderExpand?: (path: string) => void;
  selectedFile?: string | null;
}

function TreeNode({
  node,
  path,
  level,
  onFileSelect,
  onFolderExpand,
  selectedFile,
}: TreeNodeProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const fullPath = `${path}/${node.name}`;
  const isSelected = selectedFile === fullPath;

  const {
    data: children,
    isLoading,
    error,
  } = useFolderChildren(node.type === 'folder' && isExpanded ? fullPath : null);

  const handlePress = () => {
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
          isSelected && styles.nodeSelected,
        ]}
        onPress={handlePress}
        activeOpacity={0.6}
      >
        {node.type === 'folder' && (
          <Text style={styles.chevron}>
            {isExpanded ? '▾' : '▸'}
          </Text>
        )}
        <Text style={styles.nodeIcon}>{getIcon()}</Text>
        <Text
          style={[styles.nodeName, isSelected && styles.nodeNameSelected]}
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
              selectedFile={selectedFile}
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
  selectedFile,
}: FileTreeProps): React.ReactElement {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={true}>
      {initialChildren.map((node, index) => (
        <TreeNode
          key={`${node.name}-${index}`}
          node={node}
          path={rootPath}
          level={0}
          onFileSelect={onFileSelect}
          onFolderExpand={onFolderExpand}
          selectedFile={selectedFile}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkTheme.surface,
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
