import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Linking,
  StatusBar,
  Modal,
  TextInput,
  ActivityIndicator,
  Animated,
  ScrollView,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { WebView } from "react-native-webview";
import {
  RouteProp,
  useNavigation,
  useRoute,
  useIsFocused,
} from "@react-navigation/native";
import { io, Socket } from "socket.io-client";
import { WebRTCService } from "../services/WebRTCService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  generateKeyPair,
  deriveSharedSecret,
  signChallenge,
  KeyPair,
} from "../utils/crypto";
import {
  TerminalProcess,
  ProcessCreatePayload,
  ProcessTerminatePayload,
  ProcessSwitchPayload,
  TerminalInputPayload,
  TerminalOutputPayload,
  ProcessScreenPayload,
  ProcessExitedPayload,
  ProcessesSyncPayload,
} from "../types/process";
import { MainTabParamList } from "../navigation/MainTabNavigator";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { AppView, AppText, AppButton, AppCard } from "../components/ui";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { getThemeById } from "../theme/terminalThemes";

// UUID generator for process IDs
const generateUUID = (): string => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

type TerminalScreenProps = {
  navigation?: BottomTabNavigationProp<MainTabParamList, "Terminal">;
  route?: RouteProp<MainTabParamList, "Terminal">;
};

const TOKEN_KEY = "mobifai_auth_token";
const DEVICE_ID_KEY = "mobifai_device_id";
const CONNECTION_STATUS_KEY = "mobifai_connection_status";

export default function TerminalScreen({
  navigation: propNavigation,
  route: propRoute,
}: TerminalScreenProps): React.ReactElement {
  const navigation =
    propNavigation ||
    useNavigation<BottomTabNavigationProp<MainTabParamList, "Terminal">>();
  const route =
    propRoute || useRoute<RouteProp<MainTabParamList, "Terminal">>();
  const isFocused = useIsFocused();

  // Get params from route - may be undefined when accessed from tab
  const relayServerUrl = route.params?.relayServerUrl;
  const targetDeviceId = route.params?.targetDeviceId;

  // Check if we have connection params
  const hasConnectionParams = !!relayServerUrl;
  const [connected, setConnected] = useState(false);
  const [paired, setPaired] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [webrtcConnected, setWebrtcConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [terminalSettings, setTerminalSettings] = useState({
    theme: "dark",
    fontSize: 14,
    cursorStyle: "block",
    fontFamily: "monospace",
    terminalTheme: "default",
  });

  // Process management state
  const [processes, setProcesses] = useState<TerminalProcess[]>([]);
  const [activeProcessUuid, setActiveProcessUuid] = useState<string | null>(
    null
  );
  const activeProcessUuidRef = useRef<string | null>(null); // Ref to avoid stale closures
  const processCounterRef = useRef(0);
  const [loadingProcesses, setLoadingProcesses] = useState<Set<string>>(
    new Set()
  );
  const [syncingTabs, setSyncingTabs] = useState(false); // True while waiting for processes:sync

  // Keep ref in sync with state
  useEffect(() => {
    activeProcessUuidRef.current = activeProcessUuid;
  }, [activeProcessUuid]);

  // AI Prompt state
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiToastMessage, setAiToastMessage] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const scrollButtonOpacity = useRef(new Animated.Value(0)).current;

  const webViewRef = useRef<WebView>(null);
  const socketRef = useRef<Socket | null>(null);
  const webrtcRef = useRef<WebRTCService | null>(null);
  const terminalDimensionsRef = useRef<{ cols: number; rows: number } | null>(
    null
  );
  const firstProcessCreatedRef = useRef(false);

  // Security keys
  const keyPairRef = useRef<KeyPair | null>(null);
  const sharedSecretRef = useRef<Buffer | null>(null);

  /**
   * Send a message to the Mac client via WebRTC or Socket fallback
   */
  const sendToMac = useCallback((type: string, payload: unknown): boolean => {
    if (webrtcRef.current?.isWebRTCConnected()) {
      const success = webrtcRef.current.sendMessage(type, payload);
      if (!success && socketRef.current) {
        socketRef.current.emit(type, payload);
      }
      return success;
    } else if (socketRef.current) {
      socketRef.current.emit(type, payload);
      return true;
    }
    return false;
  }, []);

  /**
   * Create a new process
   */
  const createProcess = useCallback((): string | null => {
    if (!paired) {
      console.log("❌ Cannot create process: not paired");
      return null;
    }

    // Mark that a process has been created (prevents auto-create from triggering)
    firstProcessCreatedRef.current = true;

    // End syncing state if still active (user manually created a tab)
    setSyncingTabs(false);

    const uuid = generateUUID();
    processCounterRef.current += 1;
    const label = `Tab ${processCounterRef.current}`;

    console.log(`📱 Creating process: ${uuid.substring(0, 8)} (${label})`);

    const newProcess: TerminalProcess = {
      uuid,
      createdAt: Date.now(),
      label,
    };

    // Add to local state immediately
    setProcesses((prev) => [...prev, newProcess]);
    setActiveProcessUuid(uuid);
    activeProcessUuidRef.current = uuid; // Update ref immediately for callbacks

    // Show loading spinner for this process while terminal initializes
    setLoadingProcesses((prev) => new Set(prev).add(uuid));

    // Send create command to Mac (include name)
    const payload: ProcessCreatePayload = {
      uuid,
      name: label,
      cols: terminalDimensionsRef.current?.cols,
      rows: terminalDimensionsRef.current?.rows,
    };
    sendToMac("process:create", payload);

    // Clear terminal for new process and reset cursor visibility
    sendToTerminal("clear", {});
    sendToTerminal("resetCursor", {}); // Reset cursor visibility without triggering responses

    // Hide loading spinner after shell initialization completes
    setTimeout(() => {
      setLoadingProcesses((prev) => {
        const next = new Set(prev);
        next.delete(uuid);
        return next;
      });
    }, 800);

    return uuid;
  }, [paired, sendToMac]);

  /**
   * Terminate a process
   */
  const terminateProcess = useCallback(
    (uuid: string) => {
      console.log(`📱 Terminating process: ${uuid.substring(0, 8)}`);

      // Send terminate command to Mac
      const payload: ProcessTerminatePayload = { uuid };
      sendToMac("process:terminate", payload);

      // Remove from local state
      setProcesses((prev) => {
        const newProcesses = prev.filter((p) => p.uuid !== uuid);

        // If we're terminating the active process, switch to another one
        // Use ref to get current value inside callback
        if (activeProcessUuidRef.current === uuid && newProcesses.length > 0) {
          // Switch to the most recent remaining process
          const nextProcess = newProcesses[newProcesses.length - 1];
          setActiveProcessUuid(nextProcess.uuid);
          activeProcessUuidRef.current = nextProcess.uuid; // Update ref immediately

          // Send switch command
          const switchPayload: ProcessSwitchPayload = {
            activeUuids: [nextProcess.uuid],
          };
          sendToMac("process:switch", switchPayload);
        } else if (newProcesses.length === 0) {
          setActiveProcessUuid(null);
          activeProcessUuidRef.current = null; // Update ref immediately
        }

        return newProcesses;
      });
    },
    [sendToMac]
  );

  /**
   * Switch to a different process
   */
  const switchProcess = useCallback(
    (uuid: string) => {
      // Use ref to check current active process
      if (uuid === activeProcessUuidRef.current) return;

      console.log(`📱 Switching to process: ${uuid.substring(0, 8)}`);

      setActiveProcessUuid(uuid);
      activeProcessUuidRef.current = uuid; // Update ref immediately for callbacks

      // Send switch command to Mac
      const payload: ProcessSwitchPayload = { activeUuids: [uuid] };
      sendToMac("process:switch", payload);

      // Clear terminal screen and reset cursor visibility - Mac will send the snapshot
      sendToTerminal("clear", {});
      sendToTerminal("resetCursor", {}); // Reset cursor visibility without triggering responses
    },
    [sendToMac]
  );

  // Clear connection status when screen loses focus and not connected
  useEffect(() => {
    if (!isFocused && !webrtcConnected) {
      console.log(
        "🔄 Terminal screen unfocused and not connected, clearing status"
      );
      AsyncStorage.removeItem(CONNECTION_STATUS_KEY);
    }
  }, [isFocused, webrtcConnected]);

  useEffect(() => {
    // Only connect if we have connection params
    if (!hasConnectionParams) {
      console.log("⚠️  No connection params, skipping relay connection");
      // Clear any stale connection status
      AsyncStorage.removeItem(CONNECTION_STATUS_KEY);
      return;
    }

    // Generate keys for this session
    try {
      keyPairRef.current = generateKeyPair();
      console.log("🔐 Terminal: Generated session keys");
    } catch (error) {
      console.error("❌ Terminal: Failed to generate keys:", error);
      Alert.alert("Security Error", "Failed to generate encryption keys");
    }

    connectToRelay();
    fetchSettings(); // Fetch settings via HTTP

    return () => {
      // Clean up WebRTC and socket connections
      if (webrtcRef.current) {
        webrtcRef.current.cleanup();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      // Clear connection status when leaving the screen
      AsyncStorage.removeItem(CONNECTION_STATUS_KEY);
    };
  }, [hasConnectionParams]);

  // Apply terminal theme when it changes
  useEffect(() => {
    if (terminalSettings.terminalTheme) {
      const theme = getThemeById(terminalSettings.terminalTheme);
      sendToTerminal("theme", {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
        cursorAccent: theme.cursorAccent,
      });
    }
  }, [terminalSettings.terminalTheme]);

  const fetchSettings = async () => {
    try {
      if (!relayServerUrl) return;

      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) return;

      const response = await fetch(`${relayServerUrl}/api/settings`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTerminalSettings((prev) => {
          const merged = { ...prev, ...data };
          sendToTerminal("settings", merged);
          return merged;
        });
        console.log("⚙️ Fetched settings via HTTP:", data);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const sendToTerminal = (type: string, data: unknown) => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type, data }));
    }
  };

  const handleRefreshDimensions = () => {
    sendToTerminal("fit", {});

    if (terminalDimensionsRef.current && paired && socketRef.current) {
      console.log(
        "📐 Manually refreshing dimensions:",
        terminalDimensionsRef.current
      );
      socketRef.current.emit(
        "terminal:dimensions",
        terminalDimensionsRef.current
      );
      socketRef.current.emit("terminal:resize", terminalDimensionsRef.current);
    }
  };

  const handleAiPromptSubmit = () => {
    if (!aiPrompt.trim()) {
      Alert.alert("Error", "Please enter a prompt");
      return;
    }

    if (!paired) {
      Alert.alert("Error", "Not connected to Mac client");
      return;
    }

    console.log("🤖 Sending AI prompt:", aiPrompt);
    setAiProcessing(true);

    // Include active process UUID so Mac knows which terminal to target
    const promptData = {
      prompt: aiPrompt.trim(),
      uuid: activeProcessUuidRef.current,
    };
    sendToMac("ai:prompt", promptData);

    // Show toast notification instead of terminal output
    const toastMsg = `🤖 AI: "${aiPrompt.trim().substring(0, 50)}${
      aiPrompt.trim().length > 50 ? "..." : ""
    }"`;
    setAiToastMessage(toastMsg);

    // Hide toast after 3 seconds
    setTimeout(() => setAiToastMessage(null), 3000);

    // Close modal and reset
    setAiModalVisible(false);
    setAiPrompt("");

    // Reset processing state after a delay (the Mac client will handle the actual processing)
    setTimeout(() => setAiProcessing(false), 2000);
  };

  const getDeviceId = async () => {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = generateUUID();
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  };

  /**
   * Handle process-related messages from Mac
   * Uses refs to avoid stale closure issues with callbacks
   */
  const handleProcessMessage = useCallback(
    (type: string, payload: unknown) => {
      switch (type) {
        case "processes:sync": {
          // Restore tabs from Mac on reconnection
          const syncPayload = payload as ProcessesSyncPayload;
          console.log(
            `📋 Received processes:sync with ${syncPayload.processes.length} process(es)`
          );

          // End syncing state - we've received the sync data
          setSyncingTabs(false);

          if (syncPayload.processes.length > 0) {
            // Mark that processes exist (prevents auto-create)
            firstProcessCreatedRef.current = true;

            // Restore processes from Mac
            const restoredProcesses: TerminalProcess[] =
              syncPayload.processes.map((p) => ({
                uuid: p.uuid,
                createdAt: p.createdAt,
                label: p.name,
              }));

            setProcesses(restoredProcesses);

            // Update process counter to avoid duplicate names
            const maxTabNumber = restoredProcesses.reduce((max, p) => {
              const match = p.label.match(/^Tab (\d+)$/);
              return match ? Math.max(max, parseInt(match[1], 10)) : max;
            }, 0);
            processCounterRef.current = maxTabNumber;

            // Set active process
            if (syncPayload.activeUuids.length > 0) {
              const activeUuid = syncPayload.activeUuids[0];
              setActiveProcessUuid(activeUuid);
              activeProcessUuidRef.current = activeUuid;

              // Request screen snapshot for active process
              sendToMac("process:switch", { activeUuids: [activeUuid] });
            } else if (restoredProcesses.length > 0) {
              // Default to first process if none active
              const firstUuid = restoredProcesses[0].uuid;
              setActiveProcessUuid(firstUuid);
              activeProcessUuidRef.current = firstUuid;
              sendToMac("process:switch", { activeUuids: [firstUuid] });
            }

            console.log(
              `✅ Restored ${restoredProcesses.length} tab(s) from Mac`
            );
          } else {
            console.log(
              `📋 No existing tabs on Mac - user can create a new one`
            );
          }
          break;
        }
        case "process:created": {
          const { uuid } = payload as { uuid: string };
          console.log(
            `✅ Mac confirmed process created: ${uuid.substring(0, 8)}`
          );
          break;
        }
        case "process:terminated": {
          const { uuid } = payload as { uuid: string };
          console.log(
            `✅ Mac confirmed process terminated: ${uuid.substring(0, 8)}`
          );
          break;
        }
        case "process:exited": {
          const { uuid } = payload as ProcessExitedPayload;
          console.log(
            `⚠️ Process exited unexpectedly: ${uuid.substring(0, 8)}`
          );
          // Remove from local state
          setProcesses((prev) => {
            const newProcesses = prev.filter((p) => p.uuid !== uuid);
            if (
              activeProcessUuidRef.current === uuid &&
              newProcesses.length > 0
            ) {
              const nextProcess = newProcesses[newProcesses.length - 1];
              setActiveProcessUuid(nextProcess.uuid);
              activeProcessUuidRef.current = nextProcess.uuid; // Update ref immediately
            } else if (newProcesses.length === 0) {
              setActiveProcessUuid(null);
              activeProcessUuidRef.current = null; // Update ref immediately
            }
            return newProcesses;
          });
          break;
        }
        case "process:screen": {
          const { uuid, data } = payload as ProcessScreenPayload;
          console.log(
            `📺 Received screen snapshot for ${uuid.substring(0, 8)}`
          );
          // Only display if this is the active process (use ref for current value)
          if (uuid === activeProcessUuidRef.current) {
            sendToTerminal("output", data);
          }
          break;
        }
        case "process:error": {
          const { uuid, error } = payload as { uuid: string; error: string };
          console.error(
            `❌ Process error for ${uuid.substring(0, 8)}: ${error}`
          );
          Alert.alert("Process Error", error);
          break;
        }
        case "terminal:output": {
          // Handle output with uuid
          const outputPayload = payload as TerminalOutputPayload | string;
          console.log(
            `📥 Received terminal:output, payload type: ${typeof outputPayload}, activeUuid: ${activeProcessUuidRef.current?.substring(
              0,
              8
            )}`
          );

          if (typeof outputPayload === "object" && outputPayload.uuid) {
            console.log(
              `   Output from process: ${outputPayload.uuid.substring(
                0,
                8
              )}, data length: ${outputPayload.data?.length}`
            );
            // Only display if from active process (use ref for current value)
            if (outputPayload.uuid === activeProcessUuidRef.current) {
              console.log(`   ✅ Displaying output`);
              sendToTerminal("output", outputPayload.data);
            } else {
              console.log(
                `   🔇 Ignoring output from inactive process ${outputPayload.uuid.substring(
                  0,
                  8
                )}`
              );
            }
          } else {
            // Legacy format (no uuid) - display directly
            console.log(`   Legacy format, displaying directly`);
            sendToTerminal("output", outputPayload);
          }
          break;
        }
      }
    },
    [sendToMac]
  ); // Added sendToMac dependency for process:switch call

  const connectToRelay = async () => {
    setConnectionStatus("📡 Connecting to relay server...");

    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const deviceId = await getDeviceId();

    console.log(`Device ID: ${deviceId}`);

    const socket = io(relayServerUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ["websocket"],
      auth: { token },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setConnectionStatus("✅ Connected to relay server");
      // Register as mobile device with token and deviceId AND publicKey
      socket.emit("register", {
        type: "mobile",
        token,
        deviceId,
        publicKey: keyPairRef.current?.publicKey,
      });
    });

    // Handle Secure Handshake
    socket.on(
      "handshake:initiate",
      ({
        peerId,
        peerPublicKey,
        challenge,
      }: {
        peerId: string;
        peerPublicKey: string;
        challenge: string;
      }) => {
        console.log(`🔐 Starting secure handshake with ${peerId}...`);
        setConnectionStatus("🔐 Verifying security...");

        try {
          if (!keyPairRef.current) {
            throw new Error("No key pair available");
          }

          // Derive shared secret
          const sharedSecret = deriveSharedSecret(
            keyPairRef.current.privateKey,
            peerPublicKey
          );
          sharedSecretRef.current = sharedSecret;
          console.log("✅ Derived shared secret");

          // Sign the challenge
          const signature = signChallenge(challenge, sharedSecret);

          // Send response
          socket.emit("handshake:response", {
            peerId,
            signature,
          });

          console.log("📤 Sent challenge response");
        } catch (error) {
          console.error("❌ Handshake failed:", error);
          setConnectionStatus("❌ Security handshake failed");
          socket.emit("error", { message: "Handshake failed" });
        }
      }
    );

    socket.on(
      "handshake:verify",
      ({ peerId }: { peerId: string; signature: string }) => {
        console.log(`✅ Handshake verified for ${peerId}`);
        // In a full implementation, we would verify the signature here.
        // For now, confirm the handshake to complete the pairing.
        socket.emit("handshake:confirmed");
      }
    );

    socket.on("settings:updated", (newSettings) => {
      if (newSettings) {
        console.log("⚙️ Received settings update:", newSettings);
        setTerminalSettings((prev) => {
          const merged = { ...prev, ...newSettings };
          sendToTerminal("settings", merged);
          return merged;
        });
      }
    });

    socket.on("login_required", ({ loginUrl }) => {
      setConnectionStatus(
        "🔒 Authentication Required\nPlease log in via browser"
      );
      Alert.alert(
        "Authentication Required",
        "You need to log in with Google to connect.",
        [
          {
            text: "Log In",
            onPress: () => {
              const fullUrl = `${relayServerUrl}${loginUrl}`;
              Linking.openURL(fullUrl);
            },
          },
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => navigation.goBack(),
          },
        ]
      );
    });

    socket.on("authenticated", async ({ token, user }) => {
      console.log(`✅ Authenticated as ${user.email}`);
      await AsyncStorage.setItem(TOKEN_KEY, token);
      setConnectionStatus(`✅ Logged in as ${user.email}`);

      // Now that we are authenticated, request connection
      if (targetDeviceId) {
        console.log("🔌 Requesting connection to:", targetDeviceId);
        setConnectionStatus("🔗 Requesting connection...");
        socket.emit("request_connection", { targetDeviceId });
      }
    });

    socket.on("auth_error", async ({ message }) => {
      console.log(`❌ Auth Error: ${message}`);
      await AsyncStorage.removeItem(TOKEN_KEY);
      // Will trigger login_required on next attempt
      socket.emit("register", { type: "mobile", deviceId });
    });

    socket.on("waiting_for_peer", ({ message }) => {
      setConnectionStatus(`⏳ ${message}`);
    });

    socket.on("available_devices", () => {
      // Terminal screen received list update - peer might have disconnected/reconnected
      // We could potentially check if our target is still there, but for now ignore
    });

    socket.on("paired", ({ message }) => {
      setPaired(true);
      setSyncingTabs(true); // Start syncing state - waiting for processes:sync from Mac
      console.log(`✅ ${message}`);
      setConnectionStatus("");

      // Initialize WebRTC P2P connection
      console.log("🔗 Initializing WebRTC P2P connection...");

      // Store connecting status
      if (targetDeviceId) {
        AsyncStorage.setItem(
          CONNECTION_STATUS_KEY,
          JSON.stringify({
            deviceId: targetDeviceId,
            status: "connecting",
          })
        );
      }

      webrtcRef.current = new WebRTCService(socket);

      // Handle WebRTC messages - now with process support
      webrtcRef.current.onMessage((data) => {
        console.log(
          `📡 WebRTC message received: type=${
            data.type
          }, hasPayload=${!!data.payload}`
        );
        handleProcessMessage(data.type, data.payload ?? data);
      });

      // Handle WebRTC connection state
      webrtcRef.current.onStateChange(async (state) => {
        if (state === "connected") {
          setWebrtcConnected(true);
          // Store connected status with device ID
          if (targetDeviceId) {
            await AsyncStorage.setItem(
              CONNECTION_STATUS_KEY,
              JSON.stringify({
                deviceId: targetDeviceId,
                status: "connected",
              })
            );
          }
          console.log("🎉 WebRTC P2P connected!");
        } else if (state === "connecting") {
          // Store connecting status
          if (targetDeviceId) {
            AsyncStorage.setItem(
              CONNECTION_STATUS_KEY,
              JSON.stringify({
                deviceId: targetDeviceId,
                status: "connecting",
              })
            );
          }
        } else if (
          state === "disconnected" ||
          state === "failed" ||
          state === "closed"
        ) {
          setWebrtcConnected(false);
          // Clear connection status
          AsyncStorage.removeItem(CONNECTION_STATUS_KEY);
          console.log("⚠️  WebRTC disconnected, using relay server fallback");
        }
      });
    });

    socket.on("system:message", (data: { type: string; payload?: unknown }) => {
      if (data.type === "terminal_ready") {
        console.log("✅ Terminal ready on Mac side");
        setTerminalReady(true);
        setConnectionStatus("");

        // Send terminal dimensions to Mac client now that it's ready
        if (terminalDimensionsRef.current) {
          console.log(
            "📐 Sending initial dimensions to Mac:",
            terminalDimensionsRef.current
          );
          socket.emit("terminal:dimensions", terminalDimensionsRef.current);
          socket.emit("terminal:resize", terminalDimensionsRef.current);
        } else {
          // Request dimensions from WebView if not yet available
          console.log("📐 Requesting dimensions from terminal WebView");
          sendToTerminal("fit", {});
        }
      }
    });

    // Listen for process-related messages via Socket
    socket.on("processes:sync", (payload) =>
      handleProcessMessage("processes:sync", payload)
    );
    socket.on("process:created", (payload) =>
      handleProcessMessage("process:created", payload)
    );
    socket.on("process:terminated", (payload) =>
      handleProcessMessage("process:terminated", payload)
    );
    socket.on("process:exited", (payload) =>
      handleProcessMessage("process:exited", payload)
    );
    socket.on("process:screen", (payload) =>
      handleProcessMessage("process:screen", payload)
    );
    socket.on("process:error", (payload) =>
      handleProcessMessage("process:error", payload)
    );

    // Listen for terminal output via WebSocket (fallback)
    socket.on("terminal:output", (data: TerminalOutputPayload | string) => {
      if (!webrtcRef.current?.isWebRTCConnected()) {
        handleProcessMessage("terminal:output", data);
      }
    });

    socket.on("paired_device_disconnected", ({ message }) => {
      if (webrtcRef.current?.isWebRTCConnected()) {
        console.log(
          "⚠️  Relay server disconnected, but P2P connection is still active"
        );
        sendToTerminal(
          "output",
          "\r\n\x1b[33m⚠️  Relay server disconnected (P2P still active)\x1b[0m\r\n"
        );
        return;
      }

      // Reset connection state but DON'T clear processes
      // Processes persist on Mac and will be synced on reconnection
      setPaired(false);
      setWebrtcConnected(false);
      setSyncingTabs(false); // Reset syncing state
      firstProcessCreatedRef.current = false; // Reset so reconnection can sync or create

      // Clear connection status
      AsyncStorage.removeItem(CONNECTION_STATUS_KEY);

      // Clear local process state - will be restored on reconnection via processes:sync
      setProcesses([]);
      setActiveProcessUuid(null);
      activeProcessUuidRef.current = null;

      sendToTerminal("output", `\r\n\x1b[33m⚠️ ${message}\x1b[0m\r\n`);
      sendToTerminal(
        "output",
        `\r\n\x1b[36mTerminals are kept alive on Mac. Reconnect to restore.\x1b[0m\r\n`
      );
      Alert.alert(
        "Disconnected",
        `${message}\n\nYour terminals are still running on the Mac. Reconnect to restore them.`,
        [
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ]
      );
    });

    socket.on("disconnect", (reason) => {
      if (webrtcRef.current?.isWebRTCConnected()) {
        console.log(
          "⚠️  Relay server disconnected, but P2P connection is still active"
        );
        setConnected(false);
        sendToTerminal(
          "output",
          "\r\n\x1b[33m⚠️  Relay server disconnected (P2P still active)\x1b[0m\r\n"
        );
        return;
      }

      setConnected(false);
      setPaired(false);
      setProcesses([]);
      setActiveProcessUuid(null);
      sendToTerminal(
        "output",
        `\r\n\x1b[31m❌ Disconnected: ${reason}\x1b[0m\r\n`
      );
    });

    socket.on("connect_error", (error) => {
      setConnectionStatus(
        `❌ Connection error: ${error.message}\nURL: ${relayServerUrl}`
      );
      Alert.alert(
        "Connection Error",
        `Failed to connect to relay server:\n${error.message}\n\nURL: ${relayServerUrl}`,
        [
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ]
      );
    });

    socket.on("error", ({ message }) => {
      sendToTerminal("output", `\r\n\x1b[31m❌ Error: ${message}\x1b[0m\r\n`);
      Alert.alert("Error", message);
    });
  };

  // Auto-create first process after WebRTC is connected
  useEffect(() => {
    if (
      paired &&
      webrtcConnected &&
      !firstProcessCreatedRef.current &&
      terminalDimensionsRef.current
    ) {
      firstProcessCreatedRef.current = true;
      console.log("📱 Auto-creating first process after WebRTC connected...");
      // Small delay to ensure everything is stable
      setTimeout(() => {
        createProcess();
      }, 200);
    }
  }, [paired, webrtcConnected, createProcess]);

  const handleWebViewMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      // Forward WebView console logs to React Native console
      if (message.type === "console") {
        console.log(`[WebView] ${message.data}`);
        return;
      }

      if (message.type === "ready") {
        console.log("📱 Terminal WebView ready:", message.data);
        terminalDimensionsRef.current = message.data;

        // Send current settings (without theme - theme handled separately)
        sendToTerminal("settings", terminalSettings);

        // Apply terminal theme if set
        if (terminalSettings.terminalTheme) {
          const theme = getThemeById(terminalSettings.terminalTheme);
          sendToTerminal("theme", {
            background: theme.background,
            foreground: theme.foreground,
            cursor: theme.cursor,
            cursorAccent: theme.cursorAccent,
          });
        }

        if (paired && socketRef.current) {
          console.log("📤 Sending terminal dimensions:", message.data);
          socketRef.current.emit("terminal:dimensions", message.data);
        }

        // If paired with WebRTC but no process created yet, create first process now
        if (paired && webrtcConnected && !firstProcessCreatedRef.current) {
          firstProcessCreatedRef.current = true;
          console.log(
            "📱 Creating first process (dimensions ready, WebRTC connected)..."
          );
          setTimeout(() => createProcess(), 100);
        }
      } else if (message.type === "input") {
        // Use ref for current active process UUID to avoid stale closure
        const currentActiveUuid = activeProcessUuidRef.current;
        if (paired && currentActiveUuid) {
          const input = message.data;
          console.log(
            `⌨️ Input received from WebView: ${JSON.stringify(input)}`
          );

          // Send input with process uuid
          const payload: TerminalInputPayload = {
            uuid: currentActiveUuid,
            data: input,
          };

          if (webrtcRef.current?.isWebRTCConnected()) {
            console.log("📤 Sending via WebRTC P2P");
            const success = webrtcRef.current.sendMessage(
              "terminal:input",
              payload
            );
            if (!success && socketRef.current) {
              console.log("⚠️ WebRTC send failed, falling back to Socket");
              socketRef.current.emit("terminal:input", payload);
            }
          } else if (socketRef.current) {
            console.log("📤 Sending via Socket (Fallback)");
            socketRef.current.emit("terminal:input", payload);
          }
        } else {
          console.log("❌ Input ignored: Not paired or no active process");
        }
      } else if (message.type === "dimensions") {
        terminalDimensionsRef.current = message.data;
        if (paired && socketRef.current) {
          socketRef.current.emit("terminal:dimensions", message.data);
        }
      } else if (message.type === "resize") {
        if (paired && socketRef.current) {
          socketRef.current.emit("terminal:resize", message.data);
        }
      } else if (message.type === "clipboard") {
        if (message.data) {
          Clipboard.setString(message.data);
          setCopyFeedback(true);
          setTimeout(() => setCopyFeedback(false), 1500);
        }
      } else if (message.type === "scroll") {
        // Show/hide scroll-to-bottom button based on scroll position
        const { distanceFromBottom } = message.data;
        setShowScrollToBottom(distanceFromBottom > 20);
      }
    } catch (error) {
      console.error("Error handling WebView message:", error);
    }
  };

  useEffect(() => {
    if (!terminalReady && connectionStatus) {
      sendToTerminal("output", connectionStatus + "\r\n");
    }
  }, [connectionStatus, terminalReady]);

  // Animate scroll to bottom button
  useEffect(() => {
    Animated.timing(scrollButtonOpacity, {
      toValue: showScrollToBottom ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showScrollToBottom, scrollButtonOpacity]);

  const terminalHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Terminal</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css" />
    <style>
        * {
            box-sizing: border-box;
        }
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        body {
            background-color: #000;
            -webkit-user-select: none;
            user-select: none;
            -webkit-touch-callout: none;
            touch-action: pan-y;
        }
        #terminal {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            padding: 0;
            margin: 0;
            width: 100%;
            height: 100%;
        }
        #touch-layer {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 100;
            touch-action: pan-y;
        }
        .xterm {
            height: 100%;
            width: 100%;
            touch-action: pan-y;
            padding: 0 !important;
            margin: 0 !important;
            letter-spacing: 0.5px;
        }
        .xterm-viewport {
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
            touch-action: pan-y;
            padding: 0 !important;
            margin: 0 !important;
        }
        .xterm-screen {
            touch-action: pan-y;
            padding: 0 !important;
            margin: 0 !important;
        }
        .xterm-rows {
            touch-action: pan-y;
            padding: 0 !important;
            margin: 0 !important;
        }
        .xterm-rows > div {
            padding: 0 !important;
            margin: 0 !important;
        }
    </style>
</head>
<body>
    <div id="terminal"></div>
    <div id="touch-layer"></div>
    
    <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.min.js"></script>
    
    <script>
        // Forward console logs to React Native
        const originalLog = console.log;
        console.log = function(...args) {
            originalLog.apply(console, args);
            try {
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'console',
                    data: args.map(arg => 
                        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                    ).join(' ')
                }));
            } catch (e) {
                // Ignore errors in console forwarding
            }
        };

        const terminal = new Terminal({
            cursorBlink: true,
            cursorStyle: 'block',
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 14,
            lineHeight: 1.0,
            theme: {
                background: '#000000',
                foreground: '#00ff00',
                cursor: '#00ff00',
                cursorAccent: '#000000',
                selection: 'rgba(0, 255, 0, 0.3)',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#ffffff'
            },
            allowProposedApi: true,
            scrollback: 10000,
            convertEol: false,
            disableStdin: false
        });
        
        const fitAddon = new FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
        
        const webLinksAddon = new WebLinksAddon.WebLinksAddon();
        terminal.loadAddon(webLinksAddon);
        
        terminal.open(document.getElementById('terminal'));
        
        function fitTerminal() {
            try {
                const container = document.getElementById('terminal');
                if (!container) return;
                
                // First, let xterm do its default fit
                fitAddon.fit();
                
                // Now measure the actual rendered character width
                const testSpan = document.createElement('span');
                testSpan.style.fontFamily = terminal.options.fontFamily;
                testSpan.style.fontSize = terminal.options.fontSize + 'px';
                testSpan.style.lineHeight = terminal.options.lineHeight;
                testSpan.style.visibility = 'hidden';
                testSpan.style.position = 'absolute';
                testSpan.textContent = 'W'.repeat(10); // Measure 10 chars for accuracy
                document.body.appendChild(testSpan);
                
                const actualCharWidth = testSpan.offsetWidth / 10;
                document.body.removeChild(testSpan);
                
                // Calculate how many columns actually fit
                const properCols = Math.floor(container.clientWidth / actualCharWidth);
                const properRows = Math.floor(container.clientHeight / (terminal.options.fontSize * terminal.options.lineHeight));
                
                console.log('Fit calculation:', {
                    containerWidth: container.clientWidth,
                    containerHeight: container.clientHeight,
                    xtermCols: terminal.cols,
                    actualCharWidth: actualCharWidth.toFixed(2),
                    properCols: properCols,
                    properRows: properRows
                });
                
                // Resize terminal with proper columns
                if (properCols !== terminal.cols || properRows !== terminal.rows) {
                    terminal.resize(properCols, properRows);
                    console.log('Resized terminal to:', properCols, 'x', properRows);
                }
                
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'dimensions',
                    data: {
                        cols: terminal.cols,
                        rows: terminal.rows
                    }
                }));
            } catch (err) {
                console.error('Error fitting terminal:', err);
            }
        }
        
        // Initial fit with delay to ensure container is measured
        setTimeout(fitTerminal, 100);
        // Second fit to ensure dimensions are accurate
        setTimeout(fitTerminal, 250);
        
        window.addEventListener('resize', () => setTimeout(fitTerminal, 100));
        window.addEventListener('orientationchange', () => setTimeout(fitTerminal, 200));
        
        // Flag to temporarily suppress input forwarding (used when resetting cursor)
        window._suppressInput = false;
        
        terminal.onData((data) => {
            // Don't forward input when suppress flag is set (e.g., during cursor reset)
            if (window._suppressInput) return;
            
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'input',
                data: data
            }));
        });
        
        terminal.onResize((size) => {
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'resize',
                data: size
            }));
        });
        
        window.addEventListener('message', (event) => {
            try {
                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (err) {
                console.error('Error parsing message:', err);
            }
        });
        
        document.addEventListener('message', (event) => {
            try {
                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (err) {
                console.error('Error parsing document message:', err);
            }
        });
        
        const themes = {
            light: {
                background: '#FFFFFF',
                foreground: '#212121',
                cursor: '#6200EE',
                cursorAccent: '#FFFFFF',
                selection: 'rgba(98, 0, 238, 0.3)',
                black: '#000000',
                red: '#B71C1C',
                green: '#1B5E20',
                yellow: '#F57F17',
                blue: '#0D47A1',
                magenta: '#880E4F',
                cyan: '#006064',
                white: '#FFFFFF',
                brightBlack: '#9E9E9E',
                brightRed: '#E53935',
                brightGreen: '#43A047',
                brightYellow: '#FDD835',
                brightBlue: '#1E88E5',
                brightMagenta: '#8E24AA',
                brightCyan: '#00ACC1',
                brightWhite: '#FAFAFA'
            },
            dark: {
                background: '#000000',
                foreground: '#00ff00',
                cursor: '#00ff00',
                cursorAccent: '#000000',
                selection: 'rgba(0, 255, 0, 0.3)',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#ffffff'
            }
        };

        function handleMessage(message) {
            if (message.type === 'settings') {
                const s = message.data;
                // Note: Theme is now handled by separate 'theme' message type
                // Old theme system (light/dark) is deprecated
                if (s.fontSize) terminal.options.fontSize = parseInt(s.fontSize);
                if (s.cursorStyle) terminal.options.cursorStyle = s.cursorStyle;
                if (s.fontFamily) {
                    terminal.options.fontFamily = s.fontFamily === 'monospace' 
                        ? 'Menlo, Monaco, "Courier New", monospace'
                        : 'System, sans-serif';
                }
                
                setTimeout(fitTerminal, 50);
            } else if (message.type === 'theme') {
                // Apply terminal theme
                const themeData = message.data;
                terminal.options.theme = {
                    background: themeData.background,
                    foreground: themeData.foreground,
                    cursor: themeData.cursor,
                    cursorAccent: themeData.cursorAccent || themeData.background,
                };
                document.body.style.backgroundColor = themeData.background;
            } else if (message.type === 'output') {
                terminal.write(message.data);
            } else if (message.type === 'resetCursor') {
                // Reset cursor visibility without triggering onData responses
                // Temporarily suppress input forwarding while we write cursor control sequences
                window._suppressInput = true;
                terminal.write('\\x1b[?25h'); // Show cursor (DECTCEM)
                // Re-enable input after a small delay to let xterm process the sequence
                setTimeout(() => { window._suppressInput = false; }, 50);
                // Also ensure cursor blink is enabled
                terminal.options.cursorBlink = true;
            } else if (message.type === 'clear') {
                terminal.clear();
                terminal.reset();
            } else if (message.type === 'reset') {
                terminal.reset();
            } else if (message.type === 'resize') {
                if (message.data?.cols && message.data?.rows) {
                    terminal.resize(message.data.cols, message.data.rows);
                }
            } else if (message.type === 'fit') {
                fitTerminal();
            } else if (message.type === 'copy') {
                const buffer = terminal.buffer.active;
                let text = '';
                for (let i = 0; i < buffer.length; i++) {
                    const line = buffer.getLine(i);
                    if (line) {
                        text += line.translateToString(true) + '\\n';
                    }
                }
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'clipboard',
                    data: text
                }));
            } else if (message.type === 'focus') {
                terminal.focus();
            } else if (message.type === 'scrollToBottom') {
                if (window.scrollToBottom) {
                    window.scrollToBottom();
                }
            }
        }
        
        window.term = terminal;
        terminal.focus();
        
        // Custom touch handling for scroll vs tap using overlay
        let touchStartY = 0;
        let touchStartX = 0;
        let touchStartTime = 0;
        let isScrolling = false;
        let lastTouchY = 0;
        const SCROLL_THRESHOLD = 8; // pixels to determine scroll vs tap
        const TAP_TIMEOUT = 250; // ms
        
        const touchLayer = document.getElementById('touch-layer');
        const viewport = document.querySelector('.xterm-viewport');
        
        touchLayer.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
            lastTouchY = touchStartY;
            touchStartTime = Date.now();
            isScrolling = false;
        }, { passive: false });
        
        touchLayer.addEventListener('touchmove', (e) => {
            const currentY = e.touches[0].clientY;
            const currentX = e.touches[0].clientX;
            const deltaY = currentY - touchStartY;
            const deltaX = currentX - touchStartX;
            
            // If vertical movement is greater than threshold, it's a scroll
            if (Math.abs(deltaY) > SCROLL_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX)) {
                isScrolling = true;
                e.preventDefault();
                
                // Scroll the viewport based on movement since last frame
                if (viewport) {
                    const scrollDelta = lastTouchY - currentY;
                    viewport.scrollTop += scrollDelta;
                }
                lastTouchY = currentY;
            }
        }, { passive: false });
        
        touchLayer.addEventListener('touchend', (e) => {
            const touchDuration = Date.now() - touchStartTime;
            
            // If it was a quick tap without much movement, focus terminal and simulate tap
            if (!isScrolling && touchDuration < TAP_TIMEOUT) {
                // Temporarily hide the touch layer to let tap through
                touchLayer.style.pointerEvents = 'none';
                terminal.focus();
                
                // Re-enable touch layer after a short delay
                setTimeout(() => {
                    touchLayer.style.pointerEvents = 'auto';
                }, 100);
            }
        }, { passive: false });
        
        // Track scroll position and notify React Native
        function checkScrollPosition() {
            if (viewport) {
                const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'scroll',
                    data: { distanceFromBottom }
                }));
            }
        }
        
        // Check scroll on viewport scroll
        if (viewport) {
            viewport.addEventListener('scroll', checkScrollPosition);
        }
        
        // Also check periodically in case content changes
        setInterval(checkScrollPosition, 500);
        
        // Function to scroll to bottom smoothly (called from React Native)
        window.scrollToBottom = function() {
            if (viewport) {
                viewport.scrollTo({
                    top: viewport.scrollHeight,
                    behavior: 'smooth'
                });
            }
        };
        
        // Send ready message after final fit
        setTimeout(() => {
            console.log('Sending ready with dimensions:', terminal.cols, 'x', terminal.rows);
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'ready',
                data: {
                    cols: terminal.cols,
                    rows: terminal.rows
                }
            }));
        }, 300);
    </script>
</body>
</html>
  `;

  /**
   * Render a single tab
   */
  const renderTab = (process: TerminalProcess, index: number) => {
    const isActive = process.uuid === activeProcessUuid;

    return (
      <TouchableOpacity
        key={process.uuid}
        style={[styles.tab, isActive && styles.tabActive]}
        onPress={() => switchProcess(process.uuid)}
        activeOpacity={0.7}
      >
        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
          {process.label}
        </Text>
        {/* Close button - ghost style, inside tab */}
        <TouchableOpacity
          style={styles.tabCloseButton}
          onPress={(e) => {
            e.stopPropagation(); // Prevent tab switch when clicking close
            terminateProcess(process.uuid);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={styles.tabCloseText}>×</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Show "not connected" state when accessed from tab without connection params
  if (!hasConnectionParams) {
    return (
      <AppView safeArea style={notConnectedStyles.container}>
        <View style={notConnectedStyles.content}>
          <View style={notConnectedStyles.iconContainer}>
            <Text style={notConnectedStyles.icon}>◎</Text>
          </View>
          <AppText variant="h2" weight="bold" style={notConnectedStyles.title}>
            No Active Connection
          </AppText>
          <AppText style={notConnectedStyles.subtitle}>
            Connect to a Mac client to start using the terminal
          </AppText>
          <AppButton
            title="Go to Connections"
            onPress={() => navigation.navigate("Connections")}
            style={notConnectedStyles.button}
          />
        </View>
      </AppView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#0a0a0f" }}>
        {/* Header Row */}
        <View style={styles.statusBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate("Connections")}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>

          <View style={styles.statusContainer}>
            {/* Status indicator with glow */}
            <View style={styles.indicatorContainer}>
              {paired && webrtcConnected && (
                <View style={styles.indicatorGlow} />
              )}
              <View
                style={[
                  styles.indicator,
                  paired && webrtcConnected && styles.indicatorConnected,
                ]}
              />
            </View>
            <Text style={styles.statusText}>
              {copyFeedback
                ? "✓ Copied!"
                : paired && webrtcConnected
                ? "Connected"
                : paired
                ? "Connecting"
                : connected
                ? "Relay"
                : "Offline"}
            </Text>
          </View>

          <View style={styles.rightButtons}>
            <TouchableOpacity
              style={[
                styles.aiButton,
                (!paired || aiProcessing) && styles.buttonDisabled,
              ]}
              onPress={() => setAiModalVisible(true)}
              disabled={!paired || aiProcessing}
            >
              {aiProcessing ? (
                <ActivityIndicator size="small" color="#6200EE" />
              ) : (
                <Text style={styles.aiButtonText}>✨</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={handleRefreshDimensions}
            >
              <Text style={styles.refreshButtonText}>⟳</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fitButton}
              onPress={() => sendToTerminal("copy", {})}
            >
              <Text style={styles.fitButtonText}>❐</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs Row */}
        <View style={styles.tabsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScrollContent}
          >
            {processes.map((process, index) => renderTab(process, index))}

            {/* Add tab button */}
            <TouchableOpacity
              style={[styles.addTabButton, !paired && styles.buttonDisabled]}
              onPress={createProcess}
              disabled={!paired}
            >
              <Text style={styles.addTabText}>+</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </SafeAreaView>

      {processes.length > 0 ? (
        <View style={styles.terminalContainer}>
          <WebView
            ref={webViewRef}
            source={{ html: terminalHtml }}
            style={styles.webview}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            scrollEnabled={true}
            showsVerticalScrollIndicator={true}
            showsHorizontalScrollIndicator={false}
            keyboardDisplayRequiresUserAction={false}
            originWhitelist={["*"]}
            mixedContentMode="always"
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error("WebView error:", nativeEvent);
            }}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error("WebView HTTP error:", nativeEvent);
            }}
            hideKeyboardAccessoryView={true}
          />
          {/* Loading overlay while terminal initializes - only show for active process */}
          {activeProcessUuid && loadingProcesses.has(activeProcessUuid) && (
            <View style={styles.terminalLoadingOverlay}>
              <View style={styles.loadingGlow} />
              <ActivityIndicator size="small" color="#6200EE" />
              <Text style={styles.terminalLoadingText}>
                Starting terminal...
              </Text>
            </View>
          )}
        </View>
      ) : !paired ? (
        // Show connecting state before pairing is complete
        <View style={styles.emptyStateContainer}>
          <View style={styles.loadingGlow} />
          <ActivityIndicator size="large" color="#6200EE" />
          <Text style={styles.syncingTitle}>Connecting to Mac...</Text>
          <Text style={styles.syncingSubtitle}>
            Establishing secure connection
          </Text>
        </View>
      ) : syncingTabs ? (
        // Show loading state while waiting for tabs to sync from Mac
        <View style={styles.emptyStateContainer}>
          <View style={styles.loadingGlow} />
          <ActivityIndicator size="large" color="#6200EE" />
          <Text style={styles.syncingTitle}>Syncing Tabs...</Text>
          <Text style={styles.syncingSubtitle}>
            Loading your terminals from Mac
          </Text>
        </View>
      ) : (
        <View style={styles.emptyStateContainer}>
          <View style={notConnectedStyles.iconContainer}>
            <View style={notConnectedStyles.commandContainer}>
              <Text
                style={[
                  notConnectedStyles.emptyStateCommand,
                  notConnectedStyles.dollarSign,
                ]}
              >
                $
              </Text>
              <Text style={notConnectedStyles.emptyStateCommand}>ls</Text>
            </View>
          </View>
          <Text style={styles.emptyStateTitle}>No Terminal Open</Text>
          <Text style={styles.emptyStateSubtitle}>
            Tap the + button above to open a new terminal tab
          </Text>
          <TouchableOpacity
            style={[styles.emptyStateButton, !paired && styles.buttonDisabled]}
            onPress={createProcess}
            disabled={!paired}
          >
            <Text style={styles.emptyStateButtonText}>+ New Terminal</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* AI Toast Notification */}
      {aiToastMessage && (
        <View style={styles.aiToast}>
          <Text style={styles.aiToastText}>{aiToastMessage}</Text>
        </View>
      )}

      {/* Scroll to Bottom Button */}
      <Animated.View
        style={[styles.scrollToBottomButton, { opacity: scrollButtonOpacity }]}
        pointerEvents={showScrollToBottom ? "auto" : "none"}
      >
        <TouchableOpacity
          style={styles.scrollToBottomTouchable}
          onPress={() => sendToTerminal("scrollToBottom", {})}
        >
          <Text style={styles.scrollToBottomText}>↓</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* AI Prompt Modal */}
      <Modal
        visible={aiModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAiModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <Text style={styles.modalIcon}>✨</Text>
            </View>
            <Text style={styles.modalTitle}>AI Assistant</Text>
            <Text style={styles.modalSubtitle}>
              Describe what you want to do in the terminal
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="e.g., 'Open vim and write hello world'"
              placeholderTextColor="#555566"
              value={aiPrompt}
              onChangeText={setAiPrompt}
              multiline={true}
              numberOfLines={4}
              autoFocus={true}
              textAlignVertical="top"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setAiModalVisible(false);
                  setAiPrompt("");
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSubmitButton,
                  !aiPrompt.trim() && styles.buttonDisabled,
                ]}
                onPress={handleAiPromptSubmit}
                disabled={!aiPrompt.trim()}
              >
                <Text style={styles.modalSubmitButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 56,
    backgroundColor: "#0a0a0f",
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a3a",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1a1a25",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a3a",
  },
  backButtonText: {
    color: "#BB86FC",
    fontSize: 20,
    lineHeight: 20,
  },
  statusContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  rightButtons: {
    flexDirection: "row",
    minWidth: 60,
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  indicatorContainer: {
    position: "relative",
    marginRight: 8,
  },
  indicatorGlow: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(98, 0, 238, 0.4)",
    top: -5,
    left: -5,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#555566",
  },
  indicatorConnected: {
    backgroundColor: "#6200EE",
  },
  statusText: {
    color: "#8888aa",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  refreshButton: {
    backgroundColor: "#1a1a25",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a3a",
  },
  refreshButtonText: {
    color: "#BB86FC",
    fontSize: 18,
  },
  fitButton: {
    backgroundColor: "#1a1a25",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a3a",
  },
  fitButtonText: {
    color: "#BB86FC",
    fontSize: 14,
    fontWeight: "600",
  },
  aiButton: {
    backgroundColor: "#6200EE",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  aiButtonText: {
    color: "#ffffff",
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // Tabs row styles
  tabsRow: {
    height: 44,
    backgroundColor: "#12121a",
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a3a",
  },
  tabsScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
    paddingVertical: 6,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 8,
    backgroundColor: "#1a1a25",
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#2a2a3a",
    minHeight: 32,
  },
  tabActive: {
    backgroundColor: "rgba(98, 0, 238, 0.15)",
    borderWidth: 1.5,
    borderColor: "#6200EE",
    shadowColor: "#6200EE",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  tabText: {
    color: "#8888aa",
    fontSize: 13,
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#BB86FC",
    fontWeight: "600",
  },
  tabCloseButton: {
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 9,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  tabCloseText: {
    color: "#8888aa",
    fontSize: 16,
    fontWeight: "300",
    lineHeight: 16,
  },
  // Empty state styles
  emptyStateContainer: {
    flex: 1,
    backgroundColor: "#0a0a0f",
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  emptyStateTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyStateSubtitle: {
    color: "#8888aa",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  emptyStateButton: {
    backgroundColor: "#6200EE",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 200,
    alignItems: "center",
  },
  emptyStateButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  syncingTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 8,
    textAlign: "center",
  },
  syncingSubtitle: {
    color: "#8888aa",
    fontSize: 14,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  addTabButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#6200EE",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BB86FC",
  },
  addTabText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 20,
  },
  terminalContainer: {
    flex: 1,
    position: "relative",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
  terminalLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0a0a0f",
    justifyContent: "center",
    alignItems: "center",
  },
  terminalLoadingText: {
    color: "#8888aa",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 16,
  },
  loadingGlow: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(98, 0, 238, 0.3)",
    opacity: 0.5,
  },
  // AI Toast Notification
  aiToast: {
    position: "absolute",
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0, 200, 200, 0.95)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  aiToastText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  // Scroll to Bottom Button
  scrollToBottomButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    zIndex: 1000,
  },
  scrollToBottomTouchable: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#6200EE",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6200EE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#BB86FC",
  },
  scrollToBottomText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 2,
  },
  // AI Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 10, 15, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#12121a",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1.5,
    borderColor: "#6200EE",
    shadowColor: "#6200EE",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#6200EE",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 16,
    shadowColor: "#6200EE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  modalIcon: {
    fontSize: 32,
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  modalSubtitle: {
    color: "#8888aa",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: "#1a1a25",
    borderWidth: 1,
    borderColor: "#2a2a3a",
    borderRadius: 12,
    padding: 16,
    color: "#ffffff",
    fontSize: 15,
    minHeight: 120,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: "#1a1a25",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a3a",
  },
  modalCancelButtonText: {
    color: "#8888aa",
    fontSize: 16,
    fontWeight: "600",
  },
  modalSubmitButton: {
    flex: 1,
    backgroundColor: "#6200EE",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalSubmitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});

// Styles for "not connected" empty state
const notConnectedStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#1a1a25",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#2a2a3a",
  },
  icon: {
    fontSize: 48,
    color: "#8888aa",
  },
  commandContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  emptyStateCommand: {
    fontSize: 32,
    fontWeight: "700",
    color: "#BB86FC",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  dollarSign: {
    marginRight: 10,
  },
  title: {
    textAlign: "center",
    marginBottom: spacing.s,
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
  },
  subtitle: {
    textAlign: "center",
    color: "#8888aa",
    marginBottom: spacing.xl,
    lineHeight: 22,
    fontSize: 14,
  },
  button: {
    paddingHorizontal: spacing.xl,
  },
});
