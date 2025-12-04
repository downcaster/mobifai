import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import {
  View,
  ScrollView,
  Alert,
  StyleSheet,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { AppText, Slider } from "../components/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RELAY_SERVER_URL } from "../config";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { terminalThemes, TerminalTheme } from "../theme/terminalThemes";
import { SaveCombinationModal } from "../components/SaveCombinationModal";
import { SavedCombination, SAVED_COMBINATIONS_KEY } from "../types/savedCombinations";
import { TerminalAction } from "../components/KeyCombinationModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Memoized theme preview component to prevent re-renders during scroll
interface ThemePreviewProps {
  terminalTheme: TerminalTheme;
  isSelected: boolean;
  onSelect: (id: string) => void;
  theme: typeof themeColors;
}

const ThemePreviewItem = memo(function ThemePreviewItem({
  terminalTheme,
  isSelected,
  onSelect,
  theme,
}: ThemePreviewProps) {
  const handlePress = useCallback(() => {
    onSelect(terminalTheme.id);
  }, [onSelect, terminalTheme.id]);

  return (
    <TouchableOpacity
      style={[
        styles.themePreview,
        isSelected && styles.themePreviewSelected,
      ]}
      onPress={handlePress}
    >
      {isSelected && <View style={styles.themePreviewGlow} />}
      <View
        style={[
          styles.themePreviewInner,
          { backgroundColor: terminalTheme.background },
          isSelected && { borderColor: themeColors.accent.primary, borderWidth: 2.5 },
        ]}
      >
        <AppText
          style={[
            styles.themePreviewText,
            { color: terminalTheme.foreground },
          ]}
        >
          $ ls
        </AppText>
      </View>
      <AppText style={styles.themePreviewName}>
        {terminalTheme.name}
      </AppText>
    </TouchableOpacity>
  );
});

const TOKEN_KEY = "mobifai_auth_token";
const USER_INFO_KEY = "mobifai_user_info";

interface UserInfo {
  email: string;
  name?: string;
  picture?: string;
}

interface TerminalSettings {
  theme: string;
  fontSize: number;
  cursorStyle: string;
  fontFamily: string;
  terminalTheme?: string;
}

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

export default function ProfileScreen(): React.ReactElement {
  const navigation = useNavigation();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [settings, setSettings] = useState<TerminalSettings>({
    theme: "dark",
    fontSize: 14,
    cursorStyle: "block",
    fontFamily: "monospace",
    terminalTheme: "default",
  });
  const [loading, setLoading] = useState(true);
  const [savedCombinations, setSavedCombinations] = useState<SavedCombination[]>([]);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [editingCombo, setEditingCombo] = useState<SavedCombination | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (): Promise<void> => {
    try {
      const userInfoStr = await AsyncStorage.getItem(USER_INFO_KEY);
      if (userInfoStr) {
        setUserInfo(JSON.parse(userInfoStr));
      }
      await fetchSettings();
      await loadCombinations();
    } catch (error) {
      if (__DEV__) console.error("Error loading profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCombinations = async (): Promise<void> => {
    try {
      const saved = await AsyncStorage.getItem(SAVED_COMBINATIONS_KEY);
      if (saved) {
        setSavedCombinations(JSON.parse(saved));
      }
    } catch (error) {
      if (__DEV__) console.error("Error loading combinations:", error);
    }
  };

  const fetchSettings = async (): Promise<void> => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
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
        setSettings((prev) => ({ ...prev, ...data }));
      }
    } catch (error) {
      if (__DEV__) console.error("Error fetching settings:", error);
    }
  };

  const updateSetting = useCallback(async (
    key: string,
    value: string | number
  ): Promise<void> => {
    // Optimistic update
    setSettings((prev) => {
      const newSettings = { ...prev, [key]: value };
      
      // Fire API call asynchronously
      (async () => {
        try {
          const token = await AsyncStorage.getItem(TOKEN_KEY);
          if (!token) return;

          const response = await fetch(`${RELAY_SERVER_URL}/api/settings`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ [key]: value }),
          });

          if (!response.ok) {
            throw new Error("Failed to update settings");
            // Note: In production, you'd revert settings here
          }
        } catch (error) {
          if (__DEV__) console.error("Error updating settings:", error);
        }
      })();
      
      return newSettings;
    });
  }, []);

  const handleSaveCombination = async (title: string, actions: TerminalAction[]): Promise<void> => {
    try {
      let updated: SavedCombination[];
      
      if (editingCombo) {
        // Update existing combination
        updated = savedCombinations.map((c) =>
          c.id === editingCombo.id ? { ...c, title, actions } : c
        );
      } else {
        // Create new combination
        const newCombination: SavedCombination = {
          id: Date.now().toString(),
          title,
          actions,
        };
        updated = [...savedCombinations, newCombination];
      }
      
      setSavedCombinations(updated);
      await AsyncStorage.setItem(SAVED_COMBINATIONS_KEY, JSON.stringify(updated));
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
            await AsyncStorage.setItem(SAVED_COMBINATIONS_KEY, JSON.stringify(updated));
          } catch (error) {
            if (__DEV__) console.error("Error deleting combination:", error);
          }
        },
      },
    ]);
  };

  const handleLogout = useCallback((): void => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.removeItem(TOKEN_KEY);
            await AsyncStorage.removeItem(USER_INFO_KEY);
            await AsyncStorage.removeItem("mobifai_device_id");

            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: "Auth" as never }],
              })
            );
          } catch (e) {
            if (__DEV__) console.error("Logout error:", e);
          }
        },
      },
    ]);
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={themeColors.accent.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        scrollEventThrottle={16}
      >
        {/* Profile Header with Gradient */}
        <View style={styles.headerSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarGlow} />
            {userInfo?.picture ? (
              <Image source={{ uri: userInfo.picture }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <AppText style={styles.avatarText}>
                  {userInfo?.name?.charAt(0) ||
                    userInfo?.email?.charAt(0) ||
                    "?"}
                </AppText>
              </View>
            )}
          </View>
          <AppText style={styles.userName}>{userInfo?.name || "User"}</AppText>
          <AppText style={styles.userEmail}>
            {userInfo?.email || "Not signed in"}
          </AppText>
        </View>

        {/* Settings Sections */}
        <View style={styles.sectionsContainer}>
          {/* Display Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <AppText style={styles.sectionIconText}>◐</AppText>
              </View>
              <AppText style={styles.sectionTitle}>Display</AppText>
            </View>

            <View style={styles.card}>
              {/* Font Size Slider */}
              <View style={styles.settingItem}>
                <AppText style={styles.settingLabel}>Font Size</AppText>
                <View style={styles.sliderContainer}>
                  <Slider
                    value={settings.fontSize}
                    min={8}
                    max={22}
                    step={1}
                    onValueChange={(val) => updateSetting("fontSize", val)}
                    minLabel="Small"
                    maxLabel="Large"
                    trackColor={themeColors.bg.tertiary}
                    activeTrackColor={themeColors.accent.primary}
                  />
                </View>
              </View>

              <View style={styles.divider} />

              {/* Terminal Theme Picker */}
              <View style={styles.settingItem}>
                <AppText style={styles.settingLabel}>Terminal Theme</AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.themesContainer}
                  removeClippedSubviews={true}
                >
                  {terminalThemes.map((terminalTheme) => (
                    <ThemePreviewItem
                      key={terminalTheme.id}
                      terminalTheme={terminalTheme}
                      isSelected={settings.terminalTheme === terminalTheme.id}
                      onSelect={(id) => updateSetting("terminalTheme", id)}
                      theme={themeColors}
                    />
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>

          {/* Terminal Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <AppText style={styles.sectionIconText}>▣</AppText>
              </View>
              <AppText style={styles.sectionTitle}>Terminal</AppText>
            </View>

            <View style={styles.card}>
              {/* Cursor Style */}
              <View style={styles.settingItem}>
                <AppText style={styles.settingLabel}>Cursor Style</AppText>
                <View style={styles.cursorGroup}>
                  {(["block", "underline", "bar"] as const).map((style) => (
                    <TouchableOpacity
                      key={style}
                      style={[
                        styles.cursorOption,
                        settings.cursorStyle === style &&
                          styles.cursorOptionActive,
                      ]}
                      onPress={() => updateSetting("cursorStyle", style)}
                    >
                      <View style={styles.cursorPreview}>
                        {style === "block" && (
                          <View style={styles.cursorBlock} />
                        )}
                        {style === "underline" && (
                          <View style={styles.cursorUnderline} />
                        )}
                        {style === "bar" && <View style={styles.cursorBar} />}
                      </View>
                      <AppText
                        style={[
                          styles.cursorLabel,
                          settings.cursorStyle === style &&
                            styles.cursorLabelActive,
                        ]}
                      >
                        {style.charAt(0).toUpperCase() + style.slice(1)}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Command Combinations Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <AppText style={styles.sectionIconText}>⌘</AppText>
              </View>
              <AppText style={styles.sectionTitle}>Command Combinations</AppText>
            </View>

            <View style={styles.card}>
              {savedCombinations.length > 0 ? (
                savedCombinations.map((combo, index) => {
                  const preview = combo.actions
                    .map((a) => (a.type === 'text' ? a.value : a.label || ''))
                    .join(' ');
                  
                  return (
                    <View key={combo.id}>
                      {index > 0 && <View style={styles.divider} />}
                      <TouchableOpacity
                        style={styles.comboItem}
                        onPress={() => handleEditCombination(combo)}
                      >
                        <View style={styles.comboContent}>
                          <AppText style={styles.comboTitle}>{combo.title}</AppText>
                          <AppText style={styles.comboPreview} numberOfLines={1}>
                            {preview}
                          </AppText>
                        </View>
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleDeleteCombination(combo.id);
                          }}
                        >
                          <AppText style={styles.deleteButtonText}>×</AppText>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyComboState}>
                  <AppText style={styles.emptyComboText}>
                    No saved combinations yet
                  </AppText>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.addComboButton}
              onPress={() => setSaveModalVisible(true)}
            >
              <AppText style={styles.addComboButtonText}>+ New Combination</AppText>
            </TouchableOpacity>
          </View>

          {/* Account Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <AppText style={styles.sectionIconText}>●</AppText>
              </View>
              <AppText style={styles.sectionTitle}>Account</AppText>
            </View>

            <TouchableOpacity style={styles.signOutButton} onPress={handleLogout}>
              <AppText style={styles.signOutText}>Sign Out</AppText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <AppText style={styles.footerText}>MobiFai</AppText>
          <AppText style={styles.versionText}>v1.0.0 · AI-Powered Terminal</AppText>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.bg.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: themeColors.bg.primary,
  },
  content: {
    paddingBottom: 120,
  },
  
  // Header
  headerSection: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 16,
  },
  avatarGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: themeColors.accent.glow,
    top: -5,
    left: -5,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: themeColors.accent.primary,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: themeColors.bg.tertiary,
    borderWidth: 2,
    borderColor: themeColors.accent.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 36,
    color: themeColors.accent.secondary,
    fontWeight: "700",
  },
  userName: {
    fontSize: 24,
    fontWeight: "700",
    color: themeColors.text.primary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: themeColors.text.secondary,
  },

  // Sections
  sectionsContainer: {
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: themeColors.accent.glow,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  sectionIconText: {
    fontSize: 14,
    color: themeColors.accent.secondary,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: themeColors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // Card
  card: {
    backgroundColor: themeColors.bg.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: themeColors.border.subtle,
    overflow: "hidden",
  },
  settingItem: {
    padding: 20,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: themeColors.text.primary,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: themeColors.border.subtle,
    marginHorizontal: 20,
  },

  // Slider
  sliderContainer: {
    marginTop: 8,
  },

  // Toggle Group
  toggleGroup: {
    flexDirection: "row",
    backgroundColor: themeColors.bg.tertiary,
    borderRadius: 10,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  toggleButtonActive: {
    backgroundColor: themeColors.accent.primary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: themeColors.text.muted,
  },
  toggleTextActive: {
    color: themeColors.text.primary,
  },

  // Terminal Theme Picker
  themesContainer: {
    paddingVertical: 8,
    gap: 12,
  },
  themePreview: {
    position: "relative",
    alignItems: "center",
  },
  themePreviewSelected: {
    // Selected state handled by glow
  },
  themePreviewGlow: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 16,
    backgroundColor: themeColors.accent.glow,
    top: -4,
    left: -4,
  },
  themePreviewInner: {
    width: 80,
    height: 80,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  themePreviewText: {
    fontSize: 13,
    fontFamily: "monospace",
    fontWeight: "600",
  },
  themePreviewName: {
    fontSize: 11,
    color: themeColors.text.secondary,
    marginTop: 6,
    fontWeight: "500",
  },

  // Cursor Options
  cursorGroup: {
    flexDirection: "row",
    gap: 12,
  },
  cursorOption: {
    flex: 1,
    backgroundColor: themeColors.bg.tertiary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  cursorOptionActive: {
    borderColor: themeColors.accent.primary,
    backgroundColor: themeColors.accent.glow,
  },
  cursorPreview: {
    width: 40,
    height: 32,
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 8,
  },
  cursorBlock: {
    width: 16,
    height: 20,
    backgroundColor: themeColors.accent.secondary,
    borderRadius: 2,
  },
  cursorUnderline: {
    width: 16,
    height: 3,
    backgroundColor: themeColors.accent.secondary,
    borderRadius: 1,
  },
  cursorBar: {
    width: 3,
    height: 20,
    backgroundColor: themeColors.accent.secondary,
    borderRadius: 1,
  },
  cursorLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: themeColors.text.muted,
  },
  cursorLabelActive: {
    color: themeColors.text.primary,
  },

  // Command Combinations
  comboItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
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
  emptyComboState: {
    padding: 40,
    alignItems: "center",
  },
  emptyComboText: {
    fontSize: 14,
    color: themeColors.text.muted,
    fontStyle: "italic",
  },
  addComboButton: {
    marginTop: 12,
    backgroundColor: themeColors.accent.glow,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.accent.primary,
    padding: 16,
    alignItems: "center",
  },
  addComboButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: themeColors.accent.secondary,
  },

  // Sign Out
  signOutButton: {
    backgroundColor: "transparent",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ff4444",
    padding: 16,
    alignItems: "center",
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ff4444",
  },

  // Footer
  footer: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 20,
  },
  footerText: {
    fontSize: 16,
    fontWeight: "700",
    color: themeColors.text.muted,
    marginBottom: 4,
  },
  versionText: {
    fontSize: 12,
    color: themeColors.text.muted,
  },
});
