import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useNavigation, CommonActions, useFocusEffect } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { io, Socket } from "socket.io-client";
import { RELAY_SERVER_URL } from "../config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppText } from "../components/ui";
import { generateKeyPair } from "../utils/crypto";
import { MainTabParamList } from "../navigation/MainTabNavigator";
import { SafeAreaView } from "react-native-safe-area-context";

type AvailableDevice = {
  deviceId: string;
  deviceName: string;
  status: string;
  tabCount?: number;
};

type ConnectionStatus = {
  deviceId: string;
  status: "connecting" | "connected";
};

const TOKEN_KEY = "mobifai_auth_token";
const DEVICE_ID_KEY = "mobifai_device_id";
const CONNECTION_STATUS_KEY = "mobifai_connection_status";

// Design tokens
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
    selected: "rgba(98, 0, 238, 0.15)",
    connecting: "rgba(255, 170, 0, 0.15)",
  },
  text: {
    primary: "#ffffff",
    secondary: "#8888aa",
    muted: "#555566",
  },
  border: {
    subtle: "#2a2a3a",
    selected: "#6200EE",
    connecting: "#ffaa00",
  },
  status: {
    connected: "#00ff88",
    connecting: "#ffaa00",
  },
};

export default function DeviceListScreen(): React.ReactElement {
  const navigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList, "Connections">>();
  const [devices, setDevices] = useState<AvailableDevice[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);

  const [keyPair, setKeyPair] = useState<{
    publicKey: string;
    privateKey: string;
  } | null>(null);

  // Load connection status on focus
  useFocusEffect(
    useCallback(() => {
      const loadConnectionStatus = async (): Promise<void> => {
        const statusStr = await AsyncStorage.getItem(CONNECTION_STATUS_KEY);
        if (statusStr) {
          try {
            const status = JSON.parse(statusStr) as ConnectionStatus;
            setConnectionStatus(status);
          } catch {
            setConnectionStatus(null);
          }
        } else {
          setConnectionStatus(null);
        }
      };
      loadConnectionStatus();
      
      // Poll for status changes while on this screen
      const interval = setInterval(loadConnectionStatus, 1000);
      return () => clearInterval(interval);
    }, [])
  );

  useEffect(() => {
    let newSocket: Socket | null = null;

    const initSocket = async (): Promise<void> => {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

        if (!token || !deviceId) {
          Alert.alert("Error", "Authentication missing");
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: "Auth" as never }],
            })
          );
          return;
        }

        const keys = generateKeyPair();
        setKeyPair(keys);

        newSocket = io(RELAY_SERVER_URL, {
          transports: ["websocket"],
          auth: { token },
          query: { deviceId, type: "mobile" },
          forceNew: true,
        });

        newSocket.on("connect", () => {
          newSocket?.emit("register", {
            type: "mobile",
            token,
            deviceId,
            publicKey: keys.publicKey,
          });
        });

        newSocket.on("error", (err) => {
          Alert.alert("Connection Error", err.message || "Unknown error");
        });

        newSocket.on("auth_error", async (err: { message: string }) => {
          Alert.alert(
            "Session Expired",
            "Your session has expired. Please sign in again."
          );
          await AsyncStorage.removeItem(TOKEN_KEY);
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: "Auth" as never }],
            })
          );
        });

        newSocket.on("available_devices", (availableMacs: AvailableDevice[]) => {
          setDevices(availableMacs);
          setIsLoading(false);
          setRefreshing(false);
        });

        setSocket(newSocket);
      } catch (e) {
        console.error("DeviceList: Init error", e);
        setIsLoading(false);
      }
    };

    initSocket();

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [navigation]);

  const handleRefresh = async (): Promise<void> => {
    if (socket && keyPair) {
      setRefreshing(true);
      const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      socket.emit("register", {
        type: "mobile",
        token,
        deviceId,
        publicKey: keyPair.publicKey,
      });
    }
  };

  const handleDevicePress = async (device: AvailableDevice): Promise<void> => {
    // Don't reconnect if already connected to this device
    if (connectionStatus?.deviceId === device.deviceId && connectionStatus.status === "connected") {
      navigation.navigate("Terminal", {
        relayServerUrl: RELAY_SERVER_URL,
        targetDeviceId: device.deviceId,
      });
      return;
    }
    
    if (socket) socket.disconnect();
    
    navigation.navigate("Terminal", {
      relayServerUrl: RELAY_SERVER_URL,
      targetDeviceId: device.deviceId,
    });
  };

  const getDeviceState = (deviceId: string): "idle" | "connecting" | "connected" => {
    if (!connectionStatus || connectionStatus.deviceId !== deviceId) {
      return "idle";
    }
    return connectionStatus.status;
  };

  const renderDevice = ({
    item,
  }: {
    item: AvailableDevice;
  }): React.ReactElement => {
    const deviceState = getDeviceState(item.deviceId);
    const isConnected = deviceState === "connected";
    const isConnecting = deviceState === "connecting";
    const tabCount = item.tabCount ?? 0;
    
    return (
      <TouchableOpacity
        style={[
          styles.deviceCard,
          isConnected && styles.deviceCardConnected,
          isConnecting && styles.deviceCardConnecting,
        ]}
        onPress={() => handleDevicePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.deviceContent}>
          <View style={styles.deviceIconContainer}>
            <View style={[
              styles.deviceIconGlow,
              isConnected && styles.deviceIconGlowConnected,
              isConnecting && styles.deviceIconGlowConnecting,
            ]} />
            <View style={[
              styles.deviceIcon,
              isConnected && styles.deviceIconConnected,
              isConnecting && styles.deviceIconConnecting,
            ]}>
              <AppText style={styles.deviceIconText}>◉</AppText>
            </View>
            <View style={[
              styles.statusDot,
              isConnected && styles.statusDotConnected,
              isConnecting && styles.statusDotConnecting,
            ]} />
          </View>
          <View style={styles.deviceInfo}>
            <AppText 
              style={styles.deviceName}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.deviceName}
            </AppText>
            <AppText style={styles.deviceMeta}>
              {tabCount === 0 
                ? "No active tabs" 
                : `${tabCount} active tab${tabCount !== 1 ? "s" : ""}`}
            </AppText>
          </View>
          {isConnecting && (
            <View style={styles.connectingBadge}>
              <ActivityIndicator size="small" color={theme.status.connecting} style={styles.connectingSpinner} />
              <AppText style={styles.connectingBadgeText}>Connecting</AppText>
            </View>
          )}
          {isConnected && (
            <View style={styles.connectedBadge}>
              <AppText style={styles.connectedBadgeText}>Connected</AppText>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <AppText style={styles.headerTitle}>Connections</AppText>
            <AppText style={styles.headerSubtitle}>
              Available Mac terminals
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            <AppText style={styles.refreshIcon}>↻</AppText>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <View style={styles.loadingGlow} />
            <ActivityIndicator size="large" color={theme.accent.primary} />
            <AppText style={styles.loadingText}>Scanning network...</AppText>
          </View>
        ) : devices.length === 0 ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyIconContainer}>
              <AppText style={styles.emptyIcon}>◎</AppText>
            </View>
            <AppText style={styles.emptyTitle}>No Devices Found</AppText>
            <AppText style={styles.emptyText}>
              Make sure your Mac client is running{"\n"}and connected to the network
            </AppText>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRefresh}
            >
              <AppText style={styles.retryText}>Scan Again</AppText>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={devices}
            keyExtractor={(item) => item.deviceId}
            renderItem={renderDevice}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.accent.primary}
              />
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg.primary,
  },
  safeArea: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.text.primary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.text.secondary,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.bg.tertiary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  refreshIcon: {
    fontSize: 20,
    color: theme.accent.secondary,
  },

  // Center Container (Loading/Empty)
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  loadingGlow: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: theme.accent.glow,
    opacity: 0.5,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 14,
    color: theme.text.secondary,
  },

  // Empty State
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.bg.tertiary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  emptyIcon: {
    fontSize: 48,
    color: theme.text.muted,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.text.primary,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: theme.text.secondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: theme.accent.primary,
  },
  retryText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.text.primary,
  },

  // Device List
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  deviceCard: {
    backgroundColor: theme.bg.card,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    overflow: "hidden",
  },
  deviceCardConnected: {
    backgroundColor: theme.accent.selected,
    borderColor: theme.border.selected,
  },
  deviceCardConnecting: {
    backgroundColor: theme.accent.connecting,
    borderColor: theme.border.connecting,
  },
  deviceContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  deviceIconContainer: {
    position: "relative",
    marginRight: 16,
  },
  deviceIconGlow: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.accent.glow,
    top: -2,
    left: -2,
    opacity: 0.5,
  },
  deviceIconGlowConnected: {
    opacity: 1,
  },
  deviceIconGlowConnecting: {
    backgroundColor: "rgba(255, 170, 0, 0.3)",
    opacity: 1,
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.bg.tertiary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  deviceIconConnected: {
    borderColor: theme.accent.primary,
  },
  deviceIconConnecting: {
    borderColor: theme.border.connecting,
  },
  deviceIconText: {
    fontSize: 20,
    color: theme.accent.secondary,
  },
  statusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.text.muted,
    borderWidth: 3,
    borderColor: theme.bg.card,
  },
  statusDotConnected: {
    backgroundColor: theme.status.connected,
    borderColor: theme.accent.selected,
  },
  statusDotConnecting: {
    backgroundColor: theme.status.connecting,
    borderColor: theme.accent.connecting,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.text.primary,
    marginBottom: 4,
  },
  deviceMeta: {
    fontSize: 13,
    color: theme.text.secondary,
  },
  connectedBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: theme.accent.primary,
  },
  connectedBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.text.primary,
  },
  connectingBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255, 170, 0, 0.2)",
    borderWidth: 1,
    borderColor: theme.border.connecting,
  },
  connectingSpinner: {
    marginRight: 6,
  },
  connectingBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.status.connecting,
  },
});
