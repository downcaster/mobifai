import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { AppText } from '../ui';
import { colors } from '../../theme/colors';

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
        <AppText style={styles.emptyText}>No files open</AppText>
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
              <AppText
                style={[styles.tabName, isActive && styles.tabNameActive]}
                numberOfLines={1}
              >
                {file.name}
              </AppText>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => onCloseFile(file.path)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <AppText style={[styles.closeIcon, isActive && styles.closeIconActive]}>×</AppText>
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    maxHeight: 40,
  },
  contentContainer: {
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  emptyContainer: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: colors.text.disabled,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 6,
    marginHorizontal: 3,
    marginVertical: 4,
    paddingLeft: 8,
    paddingRight: 4,
    maxWidth: 160,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  tabName: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
    flex: 1,
  },
  tabNameActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  dirtyIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
    marginRight: 4,
  },
  closeButton: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
    borderRadius: 10,
  },
  closeIcon: {
    fontSize: 16,
    color: colors.text.disabled,
    fontWeight: '500',
  },
  closeIconActive: {
    color: colors.text.secondary,
  },
});
