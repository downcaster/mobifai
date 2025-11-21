import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import passport from "passport";
import session from "express-session";
import "./auth.js"; // Import auth configuration
import { generateToken, verifyToken } from "./auth.js";
import { initDb, query } from "./db/index.js";

dotenv.config();

// Initialize DB
initDb();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(
  session({
    secret: process.env.COOKIE_KEY || "mobifai-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: false, // Set to true if using HTTPS
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Store connected devices
interface Device {
  socket: Socket;
  deviceId: string; // Persistent ID from client
  type: "mac" | "mobile";
  userId?: string; // Authenticated User ID (email)
  userProfile?: any;
  pairedWith?: string; // DeviceID of paired device
  deviceName?: string; // Friendly name (e.g., hostname)
}

// Maps to lookup devices
const devicesBySocket = new Map<string, Device>();
const devicesById = new Map<string, Device>();

// Helper to get available Mac devices for a user
function getAvailableMacs(userId: string) {
  return Array.from(devicesById.values())
    .filter((d) => d.type === "mac" && d.userId === userId && !d.pairedWith)
    .map((d) => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName || "Unknown Mac",
      status: "available",
    }));
}

// Helper to notify mobile clients of available Macs
function notifyMobileClients(userId: string) {
  const mobiles = Array.from(devicesById.values()).filter(
    (d) => d.type === "mobile" && d.userId === userId
  );
  const macs = getAvailableMacs(userId);
  console.log(
    `📢 Notifying ${mobiles.length} mobile clients for user ${userId} about ${macs.length} available Macs`
  );
  mobiles.forEach((m) => m.socket.emit("available_devices", macs));
}

// Helper to match devices by User ID - REMOVED AUTO PAIRING
// function findAndPairDevice(currentDevice: Device) { ... }

// ... Auth Routes ...

// ...

// WebSocket connection handling
io.on("connection", (socket) => {
  console.log("Device connected:", socket.id);

  // Register device with optional token
  socket.on(
    "register",
    ({
      type,
      token,
      deviceId,
      deviceName,
    }: {
      type: "mac" | "mobile";
      token?: string;
      deviceId: string;
      deviceName?: string;
    }) => {
      if (!deviceId) {
        socket.emit("error", { message: "deviceId required" });
        return;
      }

      console.log(`Registering ${type} device: ${deviceId} (${socket.id})`);

      let userId: string | undefined;
      let userProfile: any;

      // Verify token if provided
      if (token) {
        const decoded: any = verifyToken(token);
        if (decoded) {
          userId = decoded.email;
          userProfile = decoded;
          console.log(`🔓 Authenticated as ${userId}`);

          // IMPORTANT: Emit 'authenticated' event back to the client
          // This allows the client to proceed to the next screen
          socket.emit("authenticated", {
            token,
            user: {
              id: decoded.id,
              email: decoded.email,
              name: decoded.name,
              photo: decoded.photo,
            },
          });
        } else {
          console.log("❌ Invalid token provided");
          socket.emit("auth_error", { message: "Invalid or expired token" });
          return;
        }
      }

      const device: Device = {
        socket,
        deviceId,
        type,
        userId,
        userProfile,
        pairedWith: undefined,
        deviceName:
          deviceName || (type === "mac" ? "Mac Terminal" : "Mobile Device"),
      };

      // Store device info
      devicesBySocket.set(socket.id, device);
      devicesById.set(deviceId, device);

      // If authenticated
      if (userId) {
        if (type === "mac") {
          // Notify mobiles that a new Mac is available
          notifyMobileClients(userId);
        } else {
          // Send available Macs to this mobile immediately
          const macs = getAvailableMacs(userId);
          console.log(
            `📲 Sending ${macs.length} available devices to mobile ${deviceId}`
          );
          socket.emit("available_devices", macs);
        }
      } else {
        // Not authenticated - prompt for login
        socket.emit("login_required", {
          message: "Authentication required",
          loginUrl: `/auth/google?deviceId=${deviceId}&type=${type}`,
        });
      }
    }
  );

  // Handle manual connection request from Mobile
  socket.on(
    "request_connection",
    ({ targetDeviceId }: { targetDeviceId: string }) => {
      const mobileDevice = devicesBySocket.get(socket.id);
      if (
        !mobileDevice ||
        mobileDevice.type !== "mobile" ||
        !mobileDevice.userId
      ) {
        return;
      }

      const targetDevice = devicesById.get(targetDeviceId);

      if (
        targetDevice &&
        targetDevice.type === "mac" &&
        targetDevice.userId === mobileDevice.userId &&
        !targetDevice.pairedWith
      ) {
        // Pair them
        mobileDevice.pairedWith = targetDevice.deviceId;
        targetDevice.pairedWith = mobileDevice.deviceId;

        console.log(
          `🔗 Paired Mobile (${mobileDevice.deviceId}) <-> Mac (${targetDevice.deviceId})`
        );

        // Notify both
        mobileDevice.socket.emit("paired", {
          message: `Connected to ${targetDevice.deviceName}`,
          peerId: targetDevice.deviceId,
        });

        targetDevice.socket.emit("paired", {
          message: `Connected to Mobile`,
          peerId: mobileDevice.deviceId,
        });

        // Trigger dimensions request
        targetDevice.socket.emit("request_dimensions");

        // Update list for other mobiles (remove the now-paired Mac)
        notifyMobileClients(mobileDevice.userId);
      } else {
        socket.emit("error", {
          message: "Target device not available or invalid",
        });
        // Refresh list just in case
        const macs = getAvailableMacs(mobileDevice.userId);
        socket.emit("available_devices", macs);
      }
    }
  );

  // ... Route messages ...
  // --- Helper to route messages ---
  const routeMessage = (eventName: string, data: any) => {
    const device = devicesBySocket.get(socket.id);
    if (device?.pairedWith) {
      const peer = devicesById.get(device.pairedWith);
      if (peer) {
        peer.socket.emit(eventName, data);
      } else {
        // Peer lost?
        device.pairedWith = undefined;
        // If mobile lost Mac, refresh list
        if (device.type === "mobile" && device.userId) {
          const macs = getAvailableMacs(device.userId);
          socket.emit("available_devices", macs);
        }
      }
    }
  };

  // ... WebRTC Signaling ...
  socket.on("webrtc:offer", (data) => routeMessage("webrtc:offer", data));
  socket.on("webrtc:answer", (data) => routeMessage("webrtc:answer", data));
  socket.on("webrtc:ice-candidate", (data) =>
    routeMessage("webrtc:ice-candidate", data)
  );

  // ... Terminal IO ...
  socket.on("terminal:input", (data) => routeMessage("terminal:input", data));
  socket.on("terminal:output", (data) => routeMessage("terminal:output", data));
  socket.on("terminal:resize", (data) => routeMessage("terminal:resize", data));
  socket.on("terminal:dimensions", (data) =>
    routeMessage("terminal:dimensions", data)
  );
  socket.on("system:message", (data) => routeMessage("system:message", data));

  // --- User Settings ---
  socket.on("settings:get", async () => {
    const device = devicesBySocket.get(socket.id);
    if (!device?.userProfile?.id) return;

    try {
      const res = await query("SELECT settings FROM users WHERE id = $1", [
        device.userProfile.id,
      ]);
      if (res && res.rows.length > 0) {
        socket.emit("settings:updated", res.rows[0].settings);
      }
    } catch (e) {
      console.error("❌ Failed to fetch settings:", e);
    }
  });

  socket.on("settings:update", async (newSettings) => {
    const device = devicesBySocket.get(socket.id);
    if (!device?.userProfile?.id) return;

    try {
      // Merge settings using Postgres || operator
      await query(
        "UPDATE users SET settings = settings || $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [newSettings, device.userProfile.id]
      );

      const res = await query("SELECT settings FROM users WHERE id = $1", [
        device.userProfile.id,
      ]);
      const updatedSettings = res && res.rows[0]?.settings;

      // Broadcast to all devices for this user
      const userDevices = Array.from(devicesById.values()).filter(
        (d) => d.userId === device.userId
      );
      
      userDevices.forEach((d) => {
        d.socket.emit("settings:updated", updatedSettings);
      });
      
      console.log(`⚙️ Updated settings for user ${device.userId}`);
    } catch (e) {
      console.error("❌ Failed to update settings:", e);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    const device = devicesBySocket.get(socket.id);
    if (device) {
      console.log(`❌ ${device.type} device disconnected:`, socket.id);

      if (device.pairedWith) {
        const peer = devicesById.get(device.pairedWith);
        if (peer) {
          peer.socket.emit("paired_device_disconnected", {
            message: `${device.type} disconnected`,
          });
          peer.pairedWith = undefined;

          // If peer was mobile, refresh its list
          if (peer.type === "mobile" && peer.userId) {
            // The disconnected device was Mac, so list update happens below via notify
            const macs = getAvailableMacs(peer.userId);
            peer.socket.emit("available_devices", macs);
          }
        }
      }

      devicesBySocket.delete(socket.id);
      // Remove from ID map too? If we don't, it stays "available" but with dead socket.
      // Yes, for now remove it.
      if (devicesById.get(device.deviceId) === device) {
        devicesById.delete(device.deviceId);
      }

      // If it was a Mac, notify mobiles to remove from list
      if (device.type === "mac" && device.userId) {
        notifyMobileClients(device.userId);
      }
    }
  });
});

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = "0.0.0.0";

httpServer.listen(PORT, HOST, () => {
  console.log("🌐 MobiFai Relay Server (Google Auth Enabled)");
  console.log(`📡 Running on port ${PORT}`);
  console.log(
    `🔗 Auth Callback URL: http://192.168.178.7:${PORT}/auth/google/callback`
  );
  console.log("");
});
