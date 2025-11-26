import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { RELAY_SERVER_URL as DEFAULT_RELAY_SERVER_URL } from "../config";
import { io, Socket } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

type ConnectScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, "Connect">;
};

const TOKEN_KEY = "mobifai_auth_token";
const DEVICE_ID_KEY = "mobifai_device_id";

export default function ConnectScreen({ navigation }: ConnectScreenProps) {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const socketRef = useRef<Socket | null>(null);
  
  // Security keys
  const keyPairRef = useRef<KeyPair | null>(null);
  const sharedSecretRef = useRef<Buffer | null>(null);

  // Generate keys on mount
  useEffect(() => {
    try {
      keyPairRef.current = generateKeyPair();
      console.log("🔐 Generated security keys");
    } catch (error) {
      console.error("❌ Failed to generate keys:", error);
    }
  }, []);

  useEffect(() => {
    // Handle deep linking
    const handleDeepLink = async ({ url }: { url: string }) => {
      console.log("🔗 Deep link received:", url);

      if (url.includes("mobifai://auth")) {
        try {
          // Parse token from URL query params manually
          // Expected format: mobifai://auth?token=...&email=...
          const queryString = url.split("?")[1];
          if (!queryString) {
            console.error("❌ No query string in URL:", url);
            return;
          }

          const params: Record<string, string> = {};
          queryString.split("&").forEach((param) => {
            const [key, ...values] = param.split("=");
            const value = values.join("=");
            if (key && value) params[key] = decodeURIComponent(value);
          });

          const { token, email } = params;

          if (!token) {
            console.error("❌ Token not found in URL parameters:", params);
            return;
          }

          console.log(`✅ Extracted token for ${email}`);
          await AsyncStorage.setItem(TOKEN_KEY, token);
          setStatusMessage(`Authenticated as ${email || "User"}`);

          // Force cleanup existing socket before reconnecting
          if (socketRef.current) {
            console.log("🔄 Cleaning up old socket...");
            socketRef.current.disconnect();
            socketRef.current = null;
          }

          // Create FRESH socket connection with new token
          console.log("🔌 Creating new socket connection with token...");
          // Force websocket transport to avoid polling issues on iOS background resume
          const socket = io(DEFAULT_RELAY_SERVER_URL, {
            reconnection: true,
            transports: ["websocket"],
            forceNew: true,
            auth: { token }, // IMPORTANT: Pass token in auth object for immediate validation
          });

          socketRef.current = socket;

          socket.on("connect", () => {
            console.log("✅ New socket connected, registering...");
            // Must get fresh deviceId
            getDeviceId().then((id) => {
              console.log(`📱 Registering with deviceId: ${id}`);
              socket.emit("register", {
                type: "mobile",
                token,
                deviceId: id,
                publicKey: keyPairRef.current?.publicKey,
              });
            });
          });

          socket.on("authenticated", async ({ token, user }) => {
            console.log("✅ Server confirmed authentication");
            setStatusMessage(`Connected as ${user.email}`);

            // Navigate to device list immediately
            setTimeout(() => {
              socket.disconnect();
              navigation.navigate("DeviceList");
            }, 500);
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
                socket.emit("error", { message: "Handshake failed" });
              }
            }
          );

          socket.on(
            "handshake:verify",
            ({
              peerId,
              signature,
            }: {
              peerId: string;
              signature: string;
            }) => {
              // Mobile side usually initiates connection, so verification happens on response
              // But if verification is needed here, we can implement it
              console.log(`✅ Peer verified: ${peerId}`);
              socket.emit("handshake:confirmed");
            }
          );

          socket.on("waiting_for_peer", ({ message }) => {
            setStatusMessage(message);
          });

          socket.on("connect_error", (err) => {
            console.error("❌ Connect error on new socket:", err);
            setStatusMessage("Connection failed: " + err.message);
          });
        } catch (e) {
          console.error("❌ Failed to process deep link", e);
        }
      }
    };

    // Add listener
    const subscription = Linking.addEventListener("url", handleDeepLink);

    // Check initial URL
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => {
      // Cleanup socket on unmount
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      subscription.remove();
    };
  }, []);

  const getDeviceId = async () => {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = generateDeviceId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  };

  const handleConnect = async () => {
    setLoading(true);
    setStatusMessage("Connecting to relay server...");

    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const deviceId = await getDeviceId();

      const socket = io(DEFAULT_RELAY_SERVER_URL, {
        reconnection: false,
        transports: ["websocket"], // Force WebSocket to avoid polling errors
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("✅ Socket connected");
        setStatusMessage("Connected. Checking authentication...");
        socket.emit("register", {
          type: "mobile",
          token,
          deviceId,
          publicKey: keyPairRef.current?.publicKey,
        });
      });

      socket.on("authenticated", async ({ token, user }) => {
        console.log(`✅ Authenticated as ${user.email}`);
        await AsyncStorage.setItem(TOKEN_KEY, token);
        setStatusMessage(`Authenticated as ${user.email}`);

        // Navigate to device list immediately
        setTimeout(() => {
          socket.disconnect();
          navigation.navigate("DeviceList");
        }, 500);
      });

      socket.on("login_required", ({ loginUrl }) => {
        console.log("⚠️ Login required", loginUrl);
        setStatusMessage("Authentication required");
        Alert.alert(
          "Login Required",
          "You need to sign in with Google to continue.",
          [
            {
              text: "Sign In",
              onPress: () => {
                const fullUrl = `${DEFAULT_RELAY_SERVER_URL}${loginUrl}`;
                console.log("🔗 Opening URL:", fullUrl);
                Linking.openURL(fullUrl).catch((err) => {
                  console.error("❌ Failed to open URL:", err);
                  Alert.alert("Error", "Could not open browser");
                });
                setStatusMessage(
                  "Waiting for authentication...\nComplete login in browser and return here."
                );
              },
            },
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => {
                socket.disconnect();
                setLoading(false);
                setStatusMessage("");
              },
            },
          ]
        );
      });

      // ... rest of handlers ...
      socket.on("waiting_for_peer", ({ message }) => {
        setStatusMessage(message);
      });

      socket.on("auth_error", async ({ message }) => {
        await AsyncStorage.removeItem(TOKEN_KEY);
        Alert.alert("Authentication Error", message);
        socket.emit("register", {
          type: "mobile",
          deviceId,
          publicKey: keyPairRef.current?.publicKey,
        });
      });

      socket.on("connect_error", (error) => {
        console.error("❌ Socket connect_error:", error);
        setStatusMessage("");
        setLoading(false);
        Alert.alert(
          "Connection Error",
          `Failed to connect to ${DEFAULT_RELAY_SERVER_URL}\n${error.message}`
        );
      });

      socket.on("error", ({ message }) => {
        Alert.alert("Error", message);
      });
    } catch (error: any) {
      setLoading(false);
      setStatusMessage("");
      Alert.alert("Error", error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MobiFai</Text>
      <Text style={styles.subtitle}>Mobile Terminal Access</Text>

      <View style={styles.form}>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>Connect with Google</Text>
          )}
        </TouchableOpacity>

        {statusMessage ? (
          <Text style={styles.status}>{statusMessage}</Text>
        ) : (
          <Text style={styles.hint}>
            Sign in with the same Google account on both Mac and mobile to
            connect securely.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#0f0",
    textAlign: "center",
    marginBottom: 10,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  subtitle: {
    fontSize: 16,
    color: "#0f0",
    textAlign: "center",
    marginBottom: 40,
    opacity: 0.7,
  },
  form: {
    width: "100%",
  },
  label: {
    fontSize: 14,
    color: "#0f0",
    marginBottom: 8,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  input: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#0f0",
    borderRadius: 8,
    padding: 15,
    color: "#0f0",
    fontSize: 16,
    marginBottom: 20,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  button: {
    backgroundColor: "#0f0",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  status: {
    marginTop: 20,
    fontSize: 13,
    color: "#0f0",
    textAlign: "center",
    lineHeight: 20,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  hint: {
    marginTop: 30,
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
