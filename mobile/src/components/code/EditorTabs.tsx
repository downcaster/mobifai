import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Text,
} from 'react-native';

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
};

export interface OpenFile {
  path: string;
  name: string;
  isDirty: boolean;
}

interface EditorTabsProps {
  files: OpenFile[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onCloseFile: (path: string) => void;
}

export function EditorTabs({
  files,
  activeFile,
  onSelectFile,
  onCloseFile,
}: EditorTabsProps): React.ReactElement {
  if (files.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No files open</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      style={styles.container}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.contentContainer}
    >
      {files.map((file) => {
        const isActive = activeFile === file.path;
        
        return (
          <View
            key={file.path}
            style={[styles.tab, isActive && styles.tabActive]}
          >
            <TouchableOpacity
              style={styles.tabButton}
              onPress={() => onSelectFile(file.path)}
              activeOpacity={0.7}
            >
              {file.isDirty && <View style={styles.dirtyIndicator} />}
              <Text
                style={[styles.tabName, isActive && styles.tabNameActive]}
                numberOfLines={1}
              >
                {file.name}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => onCloseFile(file.path)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text style={[styles.closeIcon, isActive && styles.closeIconActive]}>×</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: darkTheme.background,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
    maxHeight: 44,
  },
  contentContainer: {
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emptyContainer: {
    backgroundColor: darkTheme.background,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: darkTheme.text.disabled,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkTheme.surfaceElevated,
    borderRadius: 8,
    marginHorizontal: 4,
    marginVertical: 6,
    paddingLeft: 12,
    paddingRight: 4,
    maxWidth: 160,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  tabActive: {
    backgroundColor: darkTheme.primary + '25',
    borderColor: darkTheme.primary,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabName: {
    fontSize: 12,
    color: darkTheme.text.secondary,
    fontWeight: '500',
    flex: 1,
  },
  tabNameActive: {
    color: darkTheme.primaryLight,
    fontWeight: '600',
  },
  dirtyIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: darkTheme.secondary,
    marginRight: 6,
  },
  closeButton: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
    borderRadius: 11,
  },
  closeIcon: {
    fontSize: 16,
    color: darkTheme.text.disabled,
    fontWeight: '500',
  },
  closeIconActive: {
    color: darkTheme.text.secondary,
  },
});
