import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { AppText } from '../ui';
import { colors } from '../../theme/colors';
import { FileNode } from '../../types/code';
import { useFolderChildren } from '../../hooks/useCodeQueries';

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

  // Only fetch children if it's a folder and expanded
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
    
    // File icons based on extension
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
          { paddingLeft: 8 + level * 16 },
          isSelected && styles.nodeSelected,
        ]}
        onPress={handlePress}
        activeOpacity={0.6}
      >
        {node.type === 'folder' && (
          <AppText style={styles.chevron}>
            {isExpanded ? '▾' : '▸'}
          </AppText>
        )}
        <AppText style={styles.nodeIcon}>{getIcon()}</AppText>
        <AppText
          style={[styles.nodeName, isSelected && styles.nodeNameSelected]}
          numberOfLines={1}
        >
          {node.name}
        </AppText>
        {isLoading && (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
        )}
      </TouchableOpacity>

      {/* Render children if expanded and loaded */}
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

      {/* Show error if folder failed to load */}
      {isExpanded && error && (
        <View
          style={[
            styles.errorContainer,
            { paddingLeft: 8 + (level + 1) * 16 },
          ]}
        >
          <AppText style={styles.errorText}>Failed to load</AppText>
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
    backgroundColor: colors.surface,
  },
  nodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 8,
    minHeight: 36,
  },
  nodeSelected: {
    backgroundColor: colors.primary + '15',
  },
  chevron: {
    fontSize: 10,
    color: colors.text.secondary,
    width: 14,
    textAlign: 'center',
    marginRight: 2,
  },
  nodeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  nodeName: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
  },
  nodeNameSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  loader: {
    marginLeft: 4,
  },
  errorContainer: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  errorText: {
    fontSize: 11,
    color: colors.error,
    fontStyle: 'italic',
  },
});
