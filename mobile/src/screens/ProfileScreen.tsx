import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Alert,
  StyleSheet,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Dimensions,
} from "react-native";
import { AppText, Slider } from "../components/ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RELAY_SERVER_URL } from "../config";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { terminalThemes, TerminalTheme } from "../theme/terminalThemes";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
const theme = {
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
    } catch (error) {
      console.error("Error loading profile data:", error);
    } finally {
      setLoading(false);
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
      console.error("Error fetching settings:", error);
    }
  };

  const updateSetting = async (
    key: string,
    value: string | number
  ): Promise<void> => {
    // Optimistic update
    const previousSettings = settings;
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

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
      }

      // Don't update settings again from server response - we already updated optimistically
      // This prevents flickering/animation on the slider
    } catch (error) {
      console.error("Error updating settings:", error);
      // Revert to previous settings on error
      setSettings(previousSettings);
    }
  };

  const handleLogout = async (): Promise<void> => {
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
            console.error("Logout error:", e);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.accent.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
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
                    min={10}
                    max={24}
                    step={1}
                    onValueChange={(val) => updateSetting("fontSize", val)}
                    minLabel="Small"
                    maxLabel="Large"
                    trackColor={theme.bg.tertiary}
                    activeTrackColor={theme.accent.primary}
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
                >
                  {terminalThemes.map((terminalTheme) => {
                    const isSelected = settings.terminalTheme === terminalTheme.id;
                    return (
                      <TouchableOpacity
                        key={terminalTheme.id}
                        style={[
                          styles.themePreview,
                          isSelected && styles.themePreviewSelected,
                        ]}
                        onPress={() => updateSetting("terminalTheme", terminalTheme.id)}
                      >
                        {isSelected && <View style={styles.themePreviewGlow} />}
                        <View
                          style={[
                            styles.themePreviewInner,
                            { backgroundColor: terminalTheme.background },
                            isSelected && { borderColor: theme.accent.primary, borderWidth: 2.5 },
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
                  })}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.bg.primary,
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
    backgroundColor: theme.accent.glow,
    top: -5,
    left: -5,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: theme.accent.primary,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: theme.bg.tertiary,
    borderWidth: 2,
    borderColor: theme.accent.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 36,
    color: theme.accent.secondary,
    fontWeight: "700",
  },
  userName: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.text.primary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: theme.text.secondary,
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
    backgroundColor: theme.accent.glow,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  sectionIconText: {
    fontSize: 14,
    color: theme.accent.secondary,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // Card
  card: {
    backgroundColor: theme.bg.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    overflow: "hidden",
  },
  settingItem: {
    padding: 20,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.text.primary,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: theme.border.subtle,
    marginHorizontal: 20,
  },

  // Slider
  sliderContainer: {
    marginTop: 8,
  },

  // Toggle Group
  toggleGroup: {
    flexDirection: "row",
    backgroundColor: theme.bg.tertiary,
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
    backgroundColor: theme.accent.primary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.text.muted,
  },
  toggleTextActive: {
    color: theme.text.primary,
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
    backgroundColor: theme.accent.glow,
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
    color: theme.text.secondary,
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
    backgroundColor: theme.bg.tertiary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  cursorOptionActive: {
    borderColor: theme.accent.primary,
    backgroundColor: theme.accent.glow,
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
    backgroundColor: theme.accent.secondary,
    borderRadius: 2,
  },
  cursorUnderline: {
    width: 16,
    height: 3,
    backgroundColor: theme.accent.secondary,
    borderRadius: 1,
  },
  cursorBar: {
    width: 3,
    height: 20,
    backgroundColor: theme.accent.secondary,
    borderRadius: 1,
  },
  cursorLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.text.muted,
  },
  cursorLabelActive: {
    color: theme.text.primary,
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
    color: theme.text.muted,
    marginBottom: 4,
  },
  versionText: {
    fontSize: 12,
    color: theme.text.muted,
  },
});
