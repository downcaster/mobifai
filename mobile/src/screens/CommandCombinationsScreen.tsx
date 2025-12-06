import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { AppText } from "../components/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SaveCombinationModal } from "../components/SaveCombinationModal";
import {
  SavedCombination,
  SAVED_COMBINATIONS_KEY,
} from "../types/savedCombinations";
import { TerminalAction } from "../components/KeyCombinationModal";

export const COMBO_BAR_VISIBLE_KEY = "mobifai_combo_bar_visible";

// Design tokens for the futuristic theme
const themeColors = {
  bg: {
    primary: "#0a0a0f",
    secondary: "#12121a",
    tertiary: "#1a1a25",
    card: "#15151f",
  },
  accent: {
    primary: "#6200EE",
    secondary: "#BB86FC",
    glow: "rgba(98, 0, 238, 0.3)",
  },
  text: {
    primary: "#ffffff",
    secondary: "#8888aa",
    muted: "#555566",
  },
  border: {
    subtle: "#2a2a3a",
    accent: "#6200EE40",
  },
};

export default function CommandCombinationsScreen(): React.ReactElement {
  const navigation = useNavigation();
  const [savedCombinations, setSavedCombinations] = useState<
    SavedCombination[]
  >([]);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [editingCombo, setEditingCombo] = useState<SavedCombination | null>(
    null
  );
  const [comboBarVisible, setComboBarVisible] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (): Promise<void> => {
    try {
      const [saved, visibleSetting] = await Promise.all([
        AsyncStorage.getItem(SAVED_COMBINATIONS_KEY),
        AsyncStorage.getItem(COMBO_BAR_VISIBLE_KEY),
      ]);
      if (saved) {
        setSavedCombinations(JSON.parse(saved));
      }
      if (visibleSetting !== null) {
        setComboBarVisible(visibleSetting === "true");
      }
    } catch (error) {
      if (__DEV__) console.error("Error loading data:", error);
    }
  };

  const toggleComboBarVisible = async (): Promise<void> => {
    const newValue = !comboBarVisible;
    setComboBarVisible(newValue);
    try {
      await AsyncStorage.setItem(COMBO_BAR_VISIBLE_KEY, String(newValue));
    } catch (error) {
      if (__DEV__) console.error("Error saving combo bar visibility:", error);
    }
  };

  const handleSaveCombination = async (
    title: string,
    actions: TerminalAction[]
  ): Promise<void> => {
    try {
      let updated: SavedCombination[];

      if (editingCombo) {
        updated = savedCombinations.map((c) =>
          c.id === editingCombo.id ? { ...c, title, actions } : c
        );
      } else {
        const newCombination: SavedCombination = {
          id: Date.now().toString(),
          title,
          actions,
        };
        updated = [...savedCombinations, newCombination];
      }

      setSavedCombinations(updated);
      await AsyncStorage.setItem(
        SAVED_COMBINATIONS_KEY,
        JSON.stringify(updated)
      );
      setEditingCombo(null);
    } catch (error) {
      if (__DEV__) console.error("Error saving combination:", error);
      Alert.alert("Error", "Failed to save combination");
    }
  };

  const handleEditCombination = (combo: SavedCombination): void => {
    setEditingCombo(combo);
    setSaveModalVisible(true);
  };

  const handleMoveCombination = async (
    index: number,
    direction: "up" | "down"
  ): Promise<void> => {
    try {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= savedCombinations.length) return;

      const updated = [...savedCombinations];
      const [moved] = updated.splice(index, 1);
      updated.splice(newIndex, 0, moved);

      setSavedCombinations(updated);
      await AsyncStorage.setItem(
        SAVED_COMBINATIONS_KEY,
        JSON.stringify(updated)
      );
    } catch (error) {
      if (__DEV__) console.error("Error reordering combinations:", error);
      Alert.alert("Error", "Failed to reorder");
    }
  };

  const handleDeleteCombination = (id: string): void => {
    Alert.alert("Delete Combination", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const updated = savedCombinations.filter((c) => c.id !== id);
            setSavedCombinations(updated);
            await AsyncStorage.setItem(
              SAVED_COMBINATIONS_KEY,
              JSON.stringify(updated)
            );
          } catch (error) {
            if (__DEV__) console.error("Error deleting combination:", error);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <AppText style={styles.backButtonText}>←</AppText>
        </TouchableOpacity>
        <AppText style={styles.headerTitle}>Command Combinations</AppText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Visibility Toggle */}
        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <AppText style={styles.settingLabel}>
                Show Combo Bar in Terminal
              </AppText>
              <AppText style={styles.settingDescription}>
                Display quick access buttons above the keyboard
              </AppText>
            </View>
            <TouchableOpacity
              style={[styles.toggle, comboBarVisible && styles.toggleActive]}
              onPress={toggleComboBarVisible}
            >
              <View
                style={[
                  styles.toggleThumb,
                  comboBarVisible && styles.toggleThumbActive,
                ]}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Combinations List */}
        <View style={styles.card}>
          {savedCombinations.length > 0 ? (
            savedCombinations.map((combo, index) => {
              const preview = combo.actions
                .map((a) => (a.type === "text" ? a.value : a.label || ""))
                .join(" ");

              return (
                <View key={combo.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={styles.comboItem}>
                    <View style={styles.reorderButtons}>
                      <TouchableOpacity
                        style={[
                          styles.reorderButton,
                          index === 0 && styles.reorderButtonDisabled,
                        ]}
                        onPress={() => handleMoveCombination(index, "up")}
                        disabled={index === 0}
                      >
                        <AppText style={styles.reorderButtonText}>↑</AppText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.reorderButton,
                          index === savedCombinations.length - 1 &&
                            styles.reorderButtonDisabled,
                        ]}
                        onPress={() => handleMoveCombination(index, "down")}
                        disabled={index === savedCombinations.length - 1}
                      >
                        <AppText style={styles.reorderButtonText}>↓</AppText>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.comboContent}
                      onPress={() => handleEditCombination(combo)}
                    >
                      <AppText style={styles.comboTitle}>{combo.title}</AppText>
                      <AppText style={styles.comboPreview} numberOfLines={1}>
                        {preview}
                      </AppText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteCombination(combo.id)}
                    >
                      <AppText style={styles.deleteButtonText}>×</AppText>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <AppText style={styles.emptyIcon}>⌘</AppText>
              <AppText style={styles.emptyTitle}>No Combinations Yet</AppText>
              <AppText style={styles.emptyText}>
                Create command combinations to quickly execute{"\n"}multi-step
                terminal operations
              </AppText>
            </View>
          )}
        </View>

        {/* Add Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setSaveModalVisible(true)}
        >
          <AppText style={styles.addButtonText}>+ New Combination</AppText>
        </TouchableOpacity>

        {/* Help Text */}
        <View style={styles.helpSection}>
          <AppText style={styles.helpTitle}>How it works</AppText>
          <AppText style={styles.helpText}>
            Command combinations allow you to chain multiple terminal actions
            together. Use text input for commands, and special keys for control
            sequences like Enter, Tab, or Ctrl+C.
          </AppText>
        </View>
      </ScrollView>

      {/* Save Combination Modal */}
      <SaveCombinationModal
        visible={saveModalVisible}
        onClose={() => {
          setSaveModalVisible(false);
          setEditingCombo(null);
        }}
        onSave={handleSaveCombination}
        initialTitle={editingCombo?.title}
        initialActions={editingCombo?.actions}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.bg.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border.subtle,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: themeColors.bg.tertiary,
  },
  backButtonText: {
    fontSize: 20,
    color: themeColors.text.primary,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: themeColors.text.primary,
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  settingCard: {
    backgroundColor: themeColors.bg.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: themeColors.border.subtle,
    marginBottom: 20,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: themeColors.text.primary,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: themeColors.text.muted,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: themeColors.bg.tertiary,
    borderWidth: 1,
    borderColor: themeColors.border.subtle,
    padding: 2,
    justifyContent: "center",
  },
  toggleActive: {
    backgroundColor: themeColors.accent.primary,
    borderColor: themeColors.accent.primary,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: themeColors.text.muted,
  },
  toggleThumbActive: {
    backgroundColor: "#ffffff",
    alignSelf: "flex-end",
  },
  card: {
    backgroundColor: themeColors.bg.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: themeColors.border.subtle,
    overflow: "hidden",
  },
  divider: {
    height: 1,
    backgroundColor: themeColors.border.subtle,
    marginHorizontal: 20,
  },
  comboItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
  },
  reorderButtons: {
    flexDirection: "column",
    gap: 4,
    marginRight: 12,
  },
  reorderButton: {
    width: 28,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: themeColors.bg.tertiary,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: themeColors.border.subtle,
  },
  reorderButtonDisabled: {
    opacity: 0.3,
  },
  reorderButtonText: {
    fontSize: 14,
    color: themeColors.accent.secondary,
    fontWeight: "700",
    marginTop: -2,
  },
  comboContent: {
    flex: 1,
    marginRight: 12,
  },
  comboTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: themeColors.text.primary,
    marginBottom: 4,
  },
  comboPreview: {
    fontSize: 12,
    fontWeight: "400",
    color: themeColors.text.muted,
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 68, 68, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButtonText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#ff4444",
    marginTop: -2,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyIcon: {
    fontSize: 48,
    color: themeColors.accent.secondary,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: themeColors.text.primary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: themeColors.text.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  addButton: {
    marginTop: 16,
    backgroundColor: themeColors.accent.glow,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.accent.primary,
    padding: 16,
    alignItems: "center",
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: themeColors.accent.secondary,
  },
  helpSection: {
    marginTop: 32,
    padding: 20,
    backgroundColor: themeColors.bg.secondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border.subtle,
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: themeColors.text.secondary,
    marginBottom: 8,
  },
  helpText: {
    fontSize: 13,
    color: themeColors.text.muted,
    lineHeight: 20,
  },
});
