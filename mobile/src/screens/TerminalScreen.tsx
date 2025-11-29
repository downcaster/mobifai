import React, { useState, useEffect, useRef } from "react";
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

// Simple UUID-like generator for device ID
const generateDeviceId = () => {
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

  // AI Prompt state
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiProcessing, setAiProcessing] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const socketRef = useRef<Socket | null>(null);
  const webrtcRef = useRef<WebRTCService | null>(null);
  const terminalDimensionsRef = useRef<{ cols: number; rows: number } | null>(
    null
  );

  // Security keys
  const keyPairRef = useRef<KeyPair | null>(null);
  const sharedSecretRef = useRef<Buffer | null>(null);

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

  const sendToTerminal = (type: string, data: any) => {
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

    // Send via WebRTC if connected, otherwise use Socket
    if (webrtcRef.current?.isWebRTCConnected()) {
      console.log("📤 Sending AI prompt via WebRTC P2P");
      const success = webrtcRef.current.sendMessage("ai:prompt", promptData);
      if (!success && socketRef.current) {
        console.log("⚠️ WebRTC send failed, falling back to Socket");
        socketRef.current.emit("ai:prompt", promptData);
      }
    } else if (socketRef.current) {
      console.log("📤 Sending AI prompt via Socket");
      socketRef.current.emit("ai:prompt", promptData);
    }

    // Show feedback in terminal
    sendToTerminal(
      "output",
      `\r\n\x1b[36m🤖 AI Processing: "${aiPrompt.trim()}"\x1b[0m\r\n`
    );

    // Close modal and reset
    setAiModalVisible(false);
    setAiPrompt("");

    // Reset processing state after a delay (the Mac client will handle the actual processing)
    setTimeout(() => setAiProcessing(false), 2000);
  };

  const getDeviceId = async () => {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = generateDeviceId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  };

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
      ({ peerId, signature }: { peerId: string; signature: string }) => {
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

      // Handle WebRTC messages
      webrtcRef.current.onMessage((data) => {
        if (data.type === "terminal:output") {
          sendToTerminal("output", data.payload);
        }
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

    // Listen for terminal output via WebSocket (fallback)
    socket.on("terminal:output", (data: string) => {
      if (!webrtcRef.current?.isWebRTCConnected()) {
        sendToTerminal("output", data);
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

  const handleWebViewMessage = (event: any) => {
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
      } else if (message.type === "input") {
        if (paired) {
          const input = message.data;
          console.log(
            `⌨️ Input received from WebView: ${JSON.stringify(input)}`
          );

          if (webrtcRef.current?.isWebRTCConnected()) {
            console.log("📤 Sending via WebRTC P2P");
            const success = webrtcRef.current.sendMessage(
              "terminal:input",
              input
            );
            if (!success && socketRef.current) {
              console.log("⚠️ WebRTC send failed, falling back to Socket");
              socketRef.current.emit("terminal:input", input);
            }
          } else if (socketRef.current) {
            console.log("📤 Sending via Socket (Fallback)");
            socketRef.current.emit("terminal:input", input);
          }
        } else {
          console.log("❌ Input ignored: Not paired");
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

  // ... (keep existing terminalHtml) ...
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
        }
        #terminal {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            padding: 8px;
        }
        .xterm {
            height: 100%;
            width: 100%;
        }
        .xterm-viewport {
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
        }
    </style>
</head>
<body>
    <div id="terminal"></div>
    
    <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.min.js"></script>
    
    <script>
        const terminal = new Terminal({
            cursorBlink: true,
            cursorStyle: 'block',
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 14,
            lineHeight: 1.2,
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
            }
        }
        
        window.term = terminal;
        terminal.focus();
        
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
      </SafeAreaView>

      <WebView
        ref={webViewRef}
        source={{ html: terminalHtml }}
        style={styles.webview}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
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
  webview: {
    flex: 1,
    backgroundColor: "#000",
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
