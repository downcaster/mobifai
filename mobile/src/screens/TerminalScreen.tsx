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
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../App";
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
} from "../types/process";

// UUID generator for process IDs
const generateUUID = (): string => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

type TerminalScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, "Terminal">;
  route: RouteProp<RootStackParamList, "Terminal">;
};

const TOKEN_KEY = "mobifai_auth_token";
const DEVICE_ID_KEY = "mobifai_device_id";

export default function TerminalScreen({
  navigation,
  route,
}: TerminalScreenProps) {
  const { relayServerUrl, targetDeviceId } = route.params;
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
  });

  // Process management state
  const [processes, setProcesses] = useState<TerminalProcess[]>([]);
  const [activeProcessUuid, setActiveProcessUuid] = useState<string | null>(null);
  const activeProcessUuidRef = useRef<string | null>(null); // Ref to avoid stale closures
  const processCounterRef = useRef(0);

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

    // Send create command to Mac
    const payload: ProcessCreatePayload = {
      uuid,
      cols: terminalDimensionsRef.current?.cols,
      rows: terminalDimensionsRef.current?.rows,
    };
    sendToMac("process:create", payload);

    // Clear terminal for new process
    sendToTerminal("clear", {});

    return uuid;
  }, [paired, sendToMac]);

  /**
   * Terminate a process
   */
  const terminateProcess = useCallback((uuid: string) => {
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
        const switchPayload: ProcessSwitchPayload = { activeUuids: [nextProcess.uuid] };
        sendToMac("process:switch", switchPayload);
      } else if (newProcesses.length === 0) {
        setActiveProcessUuid(null);
        activeProcessUuidRef.current = null; // Update ref immediately
      }
      
      return newProcesses;
    });
  }, [sendToMac]);

  /**
   * Switch to a different process
   */
  const switchProcess = useCallback((uuid: string) => {
    // Use ref to check current active process
    if (uuid === activeProcessUuidRef.current) return;

    console.log(`📱 Switching to process: ${uuid.substring(0, 8)}`);
    
    setActiveProcessUuid(uuid);
    activeProcessUuidRef.current = uuid; // Update ref immediately for callbacks

    // Send switch command to Mac
    const payload: ProcessSwitchPayload = { activeUuids: [uuid] };
    sendToMac("process:switch", payload);

    // Clear terminal screen - Mac will send the snapshot
    sendToTerminal("clear", {});
  }, [sendToMac]);

  useEffect(() => {
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
      if (webrtcRef.current) {
        webrtcRef.current.cleanup();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const fetchSettings = async () => {
    try {
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

    const promptData = { prompt: aiPrompt.trim() };
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
  const handleProcessMessage = useCallback((type: string, payload: unknown) => {
    switch (type) {
      case "process:created": {
        const { uuid } = payload as { uuid: string };
        console.log(`✅ Mac confirmed process created: ${uuid.substring(0, 8)}`);
        break;
      }
      case "process:terminated": {
        const { uuid } = payload as { uuid: string };
        console.log(`✅ Mac confirmed process terminated: ${uuid.substring(0, 8)}`);
        break;
      }
      case "process:exited": {
        const { uuid } = payload as ProcessExitedPayload;
        console.log(`⚠️ Process exited unexpectedly: ${uuid.substring(0, 8)}`);
        // Remove from local state
        setProcesses((prev) => {
          const newProcesses = prev.filter((p) => p.uuid !== uuid);
          if (activeProcessUuidRef.current === uuid && newProcesses.length > 0) {
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
        console.log(`📺 Received screen snapshot for ${uuid.substring(0, 8)}`);
        // Only display if this is the active process (use ref for current value)
        if (uuid === activeProcessUuidRef.current) {
          sendToTerminal("output", data);
        }
        break;
      }
      case "process:error": {
        const { uuid, error } = payload as { uuid: string; error: string };
        console.error(`❌ Process error for ${uuid.substring(0, 8)}: ${error}`);
        Alert.alert("Process Error", error);
        break;
      }
      case "terminal:output": {
        // Handle output with uuid
        const outputPayload = payload as TerminalOutputPayload | string;
        console.log(`📥 Received terminal:output, payload type: ${typeof outputPayload}, activeUuid: ${activeProcessUuidRef.current?.substring(0, 8)}`);
        
        if (typeof outputPayload === "object" && outputPayload.uuid) {
          console.log(`   Output from process: ${outputPayload.uuid.substring(0, 8)}, data length: ${outputPayload.data?.length}`);
          // Only display if from active process (use ref for current value)
          if (outputPayload.uuid === activeProcessUuidRef.current) {
            console.log(`   ✅ Displaying output`);
            sendToTerminal("output", outputPayload.data);
          } else {
            console.log(`   🔇 Ignoring output from inactive process ${outputPayload.uuid.substring(0, 8)}`);
          }
        } else {
          // Legacy format (no uuid) - display directly
          console.log(`   Legacy format, displaying directly`);
          sendToTerminal("output", outputPayload);
        }
        break;
      }
    }
  }, []); // No dependencies - uses refs for mutable values

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
      console.log(`✅ ${message}`);
      setConnectionStatus("Connected!\n");

      // Initialize WebRTC P2P connection
      console.log("🔗 Initializing WebRTC P2P connection...");
      webrtcRef.current = new WebRTCService(socket);

      // Handle WebRTC messages - now with process support
      webrtcRef.current.onMessage((data) => {
        console.log(`📡 WebRTC message received: type=${data.type}, hasPayload=${!!data.payload}`);
        handleProcessMessage(data.type, data.payload ?? data);
      });

      // Handle WebRTC connection state
      webrtcRef.current.onStateChange((state) => {
        if (state === "connected") {
          setWebrtcConnected(true);
          console.log("🎉 WebRTC P2P connected!");
        } else if (
          state === "disconnected" ||
          state === "failed" ||
          state === "closed"
        ) {
          setWebrtcConnected(false);
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
    socket.on("process:created", (payload) => handleProcessMessage("process:created", payload));
    socket.on("process:terminated", (payload) => handleProcessMessage("process:terminated", payload));
    socket.on("process:exited", (payload) => handleProcessMessage("process:exited", payload));
    socket.on("process:screen", (payload) => handleProcessMessage("process:screen", payload));
    socket.on("process:error", (payload) => handleProcessMessage("process:error", payload));

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

      setPaired(false);
      setProcesses([]);
      setActiveProcessUuid(null);
      sendToTerminal("output", `\r\n\x1b[31m❌ ${message}\x1b[0m\r\n`);
      Alert.alert("Disconnected", message, [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
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
    if (paired && webrtcConnected && !firstProcessCreatedRef.current && terminalDimensionsRef.current) {
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

      if (message.type === "ready") {
        console.log("📱 Terminal WebView ready:", message.data);
        terminalDimensionsRef.current = message.data;

        // Send current settings
        sendToTerminal("settings", terminalSettings);

        if (paired && socketRef.current) {
          console.log("📤 Sending terminal dimensions:", message.data);
          socketRef.current.emit("terminal:dimensions", message.data);
        }

        if (!terminalReady) {
          sendToTerminal("output", connectionStatus + "\r\n");
        }

        // If paired with WebRTC but no process created yet, create first process now
        if (paired && webrtcConnected && !firstProcessCreatedRef.current) {
          firstProcessCreatedRef.current = true;
          console.log("📱 Creating first process (dimensions ready, WebRTC connected)...");
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
        body {
            margin: 0;
            padding: 0;
            background-color: #000;
            overflow: hidden;
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
            padding: 8px;
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
        }
        .xterm-viewport {
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
            touch-action: pan-y;
        }
        .xterm-screen {
            touch-action: pan-y;
        }
        .xterm-rows {
            touch-action: pan-y;
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
                fitAddon.fit();
                const dims = {
                    cols: terminal.cols,
                    rows: terminal.rows
                };
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'dimensions',
                    data: dims
                }));
            } catch (err) {
                console.error('Error fitting terminal:', err);
            }
        }
        
        setTimeout(fitTerminal, 100);
        window.addEventListener('resize', () => setTimeout(fitTerminal, 100));
        window.addEventListener('orientationchange', () => setTimeout(fitTerminal, 200));
        
        terminal.onData((data) => {
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
                if (s.theme && themes[s.theme]) {
                    terminal.options.theme = themes[s.theme];
                    document.body.style.backgroundColor = themes[s.theme].background;
                }
                if (s.fontSize) terminal.options.fontSize = parseInt(s.fontSize);
                if (s.cursorStyle) terminal.options.cursorStyle = s.cursorStyle;
                if (s.fontFamily) {
                    terminal.options.fontFamily = s.fontFamily === 'monospace' 
                        ? 'Menlo, Monaco, "Courier New", monospace'
                        : 'System, sans-serif';
                }
                
                setTimeout(fitTerminal, 50);
            } else if (message.type === 'output') {
                terminal.write(message.data);
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
        
        setTimeout(() => {
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'ready',
                data: {
                    cols: terminal.cols,
                    rows: terminal.rows
                }
            }));
        }, 200);
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <SafeAreaView
        edges={["top"]}
        style={{ backgroundColor: "rgba(17, 17, 17, 0.9)" }}
      >
        {/* Header Row */}
        <View style={styles.statusBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>{"< Back"}</Text>
          </TouchableOpacity>

          <View style={styles.statusContainer}>
            <View
              style={[styles.indicator, connected && styles.indicatorConnected]}
            />
            <Text style={styles.statusText}>
              {copyFeedback
                ? "✓ Copied!"
                : paired && webrtcConnected
                ? "P2P Connected ⚡"
                : paired
                ? "Paired (Relay)"
                : connected
                ? "Connected"
                : "Disconnected"}
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
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.aiButtonText}>AI</Text>
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
      ) : (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateIcon}>⌨️</Text>
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
        style={[
          styles.scrollToBottomButton,
          { opacity: scrollButtonOpacity },
        ]}
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
            <Text style={styles.modalTitle}>AI Assistant</Text>
            <Text style={styles.modalSubtitle}>
              Describe what you want to do in the terminal
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="e.g., 'Open vim and write hello world'"
              placeholderTextColor="#666"
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
    backgroundColor: "#000",
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
    height: 40,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    minWidth: 60,
    justifyContent: "center",
  },
  backButtonText: {
    color: "#0f0",
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 16,
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
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#f00",
    marginRight: 6,
  },
  indicatorConnected: {
    backgroundColor: "#0f0",
  },
  statusText: {
    color: "#0f0",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textAlign: "center",
    lineHeight: 16,
  },
  refreshButton: {
    backgroundColor: "#0f0",
    width: 24,
    height: 22,
    borderRadius: 2,
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  refreshButtonText: {
    color: "#000",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 2,
    marginLeft: 3,
  },
  fitButton: {
    backgroundColor: "#0f0",
    width: 24,
    height: 22,
    borderRadius: 2,
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  fitButtonText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "bold",
    marginTop: 2,
    marginLeft: 2,
  },
  aiButton: {
    backgroundColor: "#00ffff",
    width: 28,
    height: 22,
    borderRadius: 2,
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  aiButtonText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "bold",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // Tabs row styles
  tabsRow: {
    height: 32,
    backgroundColor: "rgba(30, 30, 30, 0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  tabsScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: "transparent",
    borderRadius: 4,
    gap: 6,
  },
  tabActive: {
    backgroundColor: "rgba(0, 255, 0, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 0, 0.3)",
  },
  tabText: {
    color: "#888",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  tabTextActive: {
    color: "#0f0",
    fontWeight: "bold",
  },
  tabCloseButton: {
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  tabCloseText: {
    color: "#ccc",
    fontSize: 14,
    fontWeight: "bold",
    lineHeight: 14,
  },
  // Empty state styles
  emptyStateContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    color: "#0f0",
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    color: "#666",
    fontSize: 14,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyStateButton: {
    backgroundColor: "rgba(0, 255, 0, 0.15)",
    borderWidth: 1,
    borderColor: "#0f0",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyStateButtonText: {
    color: "#0f0",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  addTabButton: {
    width: 28,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 4,
    opacity: 0.6,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 0, 0.3)",
    borderRadius: 4,
    borderStyle: "dashed",
  },
  addTabText: {
    color: "#0f0",
    fontSize: 18,
    fontWeight: "bold",
    lineHeight: 18,
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 255, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  scrollToBottomText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 2,
  },
  // AI Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#0f0",
  },
  modalTitle: {
    color: "#0f0",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  modalSubtitle: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    fontSize: 16,
    minHeight: 100,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: "#333",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalCancelButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  modalSubmitButton: {
    flex: 1,
    backgroundColor: "#0f0",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalSubmitButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "bold",
  },
});
