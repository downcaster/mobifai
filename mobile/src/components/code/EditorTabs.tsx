import React from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Text,
} from "react-native";

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
  fontSize?: number; // Optional font size from settings
}

export function EditorTabs({
  files,
  activeFile,
  onSelectFile,
  onCloseFile,
  fontSize = 13, // Default to 13 if not provided
}: EditorTabsProps): React.ReactElement {
  if (files.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No files open</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        style={styles.container}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {files.map((file, index) => {
          const isActive = activeFile === file.path;
          const isFirst = index === 0;

          return (
            <View
              key={file.path}
              style={[
                styles.tab,
                isActive ? styles.tabActive : styles.tabInactive,
                isFirst && styles.tabFirst,
              ]}
            >
              <TouchableOpacity
                style={styles.tabButton}
                onPress={() => onSelectFile(file.path)}
                activeOpacity={0.7}
              >
                {file.isDirty && <View style={styles.dirtyIndicator} />}
                <Text
                  style={[
                    styles.tabName,
                    isActive && styles.tabNameActive,
                    { fontSize: fontSize }, // Apply dynamic font size
                  ]}
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
                <Text
                  style={[styles.closeIcon, isActive && styles.closeIconActive]}
                >
                  ×
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
      {/* Bottom border line that fills remaining space */}
      <View style={styles.bottomBorder} />
    </View>
  );
}

const TAB_HEIGHT = 36;

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    backgroundColor: darkTheme.background,
  },
  container: {
    backgroundColor: darkTheme.background,
    maxHeight: TAB_HEIGHT,
    flexGrow: 0,
  },
  contentContainer: {
    alignItems: "flex-end", // Align tabs to bottom
  },
  emptyContainer: {
    backgroundColor: darkTheme.background,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
    height: TAB_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: darkTheme.text.disabled,
  },
  bottomBorder: {
    flex: 1,
    height: TAB_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    height: TAB_HEIGHT,
    paddingLeft: 12,
    paddingRight: 4,
    minWidth: 100,
    maxWidth: 180,
    borderRightWidth: 1,
    borderRightColor: darkTheme.border,
    borderTopWidth: 1,
    borderTopColor: darkTheme.border,
  },
  tabFirst: {
    borderLeftWidth: 1,
    borderLeftColor: darkTheme.border,
  },
  tabActive: {
    backgroundColor: darkTheme.surface, // Same as content area
    borderBottomWidth: 0, // No bottom border - connected to content
  },
  tabInactive: {
    backgroundColor: "#06060a", // Even darker than background for inactive tabs
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  tabName: {
    fontSize: 13,
    color: darkTheme.text.secondary,
    fontWeight: "500",
    flex: 1,
    minWidth: 40,
  },
  tabNameActive: {
    color: darkTheme.text.primary, // White text for active
    fontWeight: "600",
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
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 4,
  },
  closeIcon: {
    fontSize: 16,
    color: darkTheme.text.disabled,
    fontWeight: "500",
  },
  closeIconActive: {
    color: darkTheme.text.secondary,
  },
});
