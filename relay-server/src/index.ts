import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import passport from "passport";
import session from "express-session";
import crypto from "crypto";
import { config } from "./config.js";
import "./auth.js"; // Import auth configuration
import { generateToken, verifyToken } from "./auth.js";
import prisma from "./prisma.js";
import { renderLoginPage } from "./pages/LoginPage.js";
import { renderSuccessPage } from "./pages/SuccessPage.js";
import { renderFailurePage } from "./pages/FailurePage.js";

// Extend session types
declare module "express-session" {
  interface SessionData {
    deviceId?: string;
    deviceType?: "mac" | "mobile";
  }
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      photo?: string;
    }
  }
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.use(
  session({
    secret: config.COOKIE_KEY,
    resave: false,
    saveUninitialized: true, // Need this for OAuth flow
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: config.NODE_ENV === "production", // Use HTTPS in production
      httpOnly: true,
      sameSite: "lax", // Important for OAuth redirects
      path: "/",
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
  userProfile?: UserProfile;
  pairedWith?: string; // DeviceID of paired device
  deviceName?: string; // Friendly name (e.g., hostname)
  publicKey?: string; // ECDH public key for secure handshake
  challenge?: string; // Random challenge for authentication
  verified?: boolean; // Whether peer has been verified
  tabCount?: number; // Number of active terminal tabs (Mac only)
}

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  photo?: string | null;
}

interface HandshakeChallenge {
  challenge: string;
  signature: string;
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
      tabCount: d.tabCount ?? 0,
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

// Auth Routes

// Login Landing Page
app.get("/login", (req, res) => {
  const deviceId = req.query.deviceId as string;
  const type = req.query.type as "mac" | "mobile";

  if (!deviceId || !type) {
    return res.status(400).send("Missing deviceId or type parameters");
  }

  const authUrl = `/auth/google?deviceId=${deviceId}&type=${type}`;

  res.send(renderLoginPage({ deviceId, type, authUrl }));
});

app.get("/auth/google", (req, res, next) => {
  // Store deviceId and type - use BOTH session AND state parameter for reliability
  if (req.query.deviceId && typeof req.query.deviceId === "string") {
    const deviceId = req.query.deviceId;
    const deviceType = req.query.type as "mac" | "mobile";

    req.session.deviceId = deviceId;
    req.session.deviceType = deviceType;

    console.log(
      `📝 Storing in session: deviceId=${deviceId}, type=${deviceType}`
    );

    // Also encode in state parameter (better for OAuth)
    const state = Buffer.from(
      JSON.stringify({ deviceId, deviceType })
    ).toString("base64");

    // Explicitly save session before redirecting
    req.session.save((err) => {
      if (err) {
        console.error("❌ Session save error:", err);
        return next(err);
      }
      console.log("✅ Session saved successfully, state parameter:", state);
      passport.authenticate("google", {
        scope: ["profile", "email"],
        state: state,
      })(req, res, next);
    });
  } else {
    passport.authenticate("google", { scope: ["profile", "email"] })(
      req,
      res,
      next
    );
  }
});

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/failure" }),
  (req, res) => {
    if (!req.user) {
      return res.redirect("/auth/failure");
    }

    const token = generateToken(req.user);
    let deviceId = req.session.deviceId;
    let deviceType = req.session.deviceType;

    // Try to get from state parameter if session is empty
    if (!deviceId && req.query.state && typeof req.query.state === "string") {
      try {
        const stateData = JSON.parse(
          Buffer.from(req.query.state, "base64").toString()
        );
        deviceId = stateData.deviceId;
        deviceType = stateData.deviceType;
        console.log(`📥 Recovered from state parameter:`, stateData);
      } catch (e) {
        console.error("❌ Failed to parse state parameter:", e);
      }
    }

    const userEmail = req.user.email;
    const user = req.user;

    console.log(`📥 OAuth callback - Final data:`, {
      deviceId,
      deviceType,
      sessionID: req.sessionID,
      hasState: !!req.query.state,
    });

    console.log(
      `✅ OAuth successful for ${userEmail}, notifying device ${
        deviceId || "NONE"
      }`
    );

    // Find the device's socket connection and notify it
    if (deviceId) {
      const device = devicesById.get(deviceId);
      if (device) {
        console.log(`📤 Sending authenticated event to device ${deviceId}`);

        // CRITICAL FIX: Update device state in memory immediately
        device.userId = user.email;
        device.userProfile = user;
        console.log(
          `✅ Updated device ${deviceId} state to user ${user.email}`
        );

        device.socket.emit("authenticated", {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            photo: user.photo,
          },
        });

        // If this is a Mac, notify connected mobiles immediately
        if (deviceType === "mac") {
          notifyMobileClients(user.email);
        }
      } else {
        console.log(
          `⚠️  Device ${deviceId} not found in connected devices. User may need to reconnect.`
        );
      }
    }

    // If mobile device, redirect to deep link
    if (deviceType === "mobile" && deviceId) {
      res.redirect(`mobifai://auth?token=${token}&email=${userEmail}`);
    } else {
      // For Mac or unknown, show success page
      res.send(
        renderSuccessPage({
          userEmail,
          deviceType: deviceType || "mac",
        })
      );
    }
  }
);

app.get("/auth/failure", (req, res) => {
  res.send(
    renderFailurePage({
      errorMessage: "Authentication failed. Please try again.",
    })
  );
});

// Middleware to verify JWT token and validate user session
const authenticateToken = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    console.error("❌ No token provided");
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    // Verify JWT token
    const decoded = verifyToken(token) as any;
    if (!decoded || !decoded.id || !decoded.email) {
      console.error("❌ Invalid token structure");
      return res.status(403).json({ error: "Invalid token" });
    }

    console.log("🔍 Validating session for user:", decoded.email);

    // Validate user exists in database (session validation)
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        photo: true,
      },
    });

    if (!user) {
      console.error("❌ User not found in database:", decoded.email);
      return res.status(403).json({ error: "User session invalid" });
    }

    // Verify email matches (additional security check)
    if (user.email !== decoded.email) {
      console.error("❌ Email mismatch in token vs database");
      return res.status(403).json({ error: "Session validation failed" });
    }

    console.log("✅ Session validated for user:", user.email);

    // Attach validated user to request
    (req as any).user = user;
    next();
  } catch (error) {
    console.error("❌ Authentication error:", error);
    return res.status(403).json({ error: "Authentication failed" });
  }
};

// Debug endpoint to test authentication
app.get("/api/me", authenticateToken, async (req, res) => {
  const user = (req as any).user;
  res.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
});

// REST API Routes for Settings
app.get("/api/settings", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    console.log("📥 GET /api/settings - User:", user.email, "ID:", user.id);

    // Fetch user with settings from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { settings: true },
    });

    if (!dbUser) {
      console.error("⚠️ User not found in DB");
      return res.status(404).json({ error: "User not found" });
    }

    // Return settings (with defaults if null)
    const settings = (dbUser.settings as any) || {
      theme: "dark",
      fontSize: 14,
      cursorStyle: "block",
      fontFamily: "monospace",
    };

    console.log("✅ Settings fetched:", settings);
    res.json(settings);
  } catch (error) {
    console.error("❌ Error fetching settings:", error);
    res.status(500).json({
      error: "Failed to fetch settings",
      details: (error as Error).message,
    });
  }
});

app.put("/api/settings", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const newSettings = req.body;

    console.log(
      "📤 PUT /api/settings - User:",
      user.email,
      "Settings:",
      newSettings
    );

    // Fetch current settings
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { settings: true },
    });

    if (!dbUser) {
      console.error("❌ User not found in DB");
      return res.status(404).json({ error: "User not found" });
    }

    const currentSettings = (dbUser.settings as any) || {};

    // Merge settings
    const mergedSettings = { ...currentSettings, ...newSettings };

    // Update in database using Prisma
    await prisma.user.update({
      where: { id: user.id },
      data: { settings: mergedSettings },
    });

    console.log("✅ Settings updated in DB");

    // Broadcast to all connected devices of this user via WebSocket
    const userDevices = Array.from(devicesById.values()).filter(
      (d) => d.userId === user.email
    );
    console.log(`📢 Broadcasting to ${userDevices.length} connected devices`);
    userDevices.forEach((device) => {
      device.socket.emit("settings:updated", mergedSettings);
    });

    res.json(mergedSettings);
  } catch (error) {
    console.error("❌ Error updating settings:", error);
    res.status(500).json({
      error: "Failed to update settings",
      details: (error as Error).message,
    });
  }
});

// ...

// WebSocket connection handling
io.on("connection", (socket) => {
  console.log("Device connected:", socket.id);

  // Register device with optional token
  socket.on(
    "register",
    async ({
      type,
      token,
      deviceId,
      deviceName,
      publicKey,
      tabCount,
    }: {
      type: "mac" | "mobile";
      token?: string;
      deviceId: string;
      deviceName?: string;
      publicKey?: string;
      tabCount?: number;
    }) => {
      if (!deviceId) {
        socket.emit("error", { message: "deviceId required" });
        return;
      }

      if (!publicKey) {
        socket.emit("error", {
          message: "publicKey required for secure connection",
        });
        return;
      }

      console.log(`Registering ${type} device: ${deviceId} (${socket.id})`);

      let userId: string | undefined;
      let userProfile: UserProfile | undefined;

      // Verify token if provided
      if (token) {
        try {
          const decoded = verifyToken(token) as {
            id: string;
            email: string;
          } | null;
          if (decoded && decoded.id) {
            // Validate user exists in DB (strict session check)
            const dbUser = await prisma.user.findUnique({
              where: { id: decoded.id },
            });

            if (dbUser) {
              userId = dbUser.email;
              userProfile = dbUser;
              console.log(`🔓 Authenticated as ${userId}`);

              // IMPORTANT: Emit 'authenticated' event back to the client
              socket.emit("authenticated", {
                token,
                user: {
                  id: dbUser.id,
                  email: dbUser.email,
                  name: dbUser.name,
                  photo: dbUser.photo,
                },
              });
            } else {
              console.log("❌ Token valid but user not found in DB");
              socket.emit("auth_error", { message: "User no longer exists" });
              return;
            }
          } else {
            console.log("❌ Invalid token provided");
            socket.emit("auth_error", { message: "Invalid or expired token" });
            return;
          }
        } catch (err) {
          console.error("❌ Auth validation error:", err);
          socket.emit("auth_error", { message: "Authentication failed" });
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
        publicKey,
        verified: false,
        tabCount: type === "mac" ? (tabCount ?? 0) : undefined,
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
          loginUrl: `/login?deviceId=${deviceId}&type=${type}`,
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
        // Generate challenges for mutual authentication
        mobileDevice.challenge = crypto.randomBytes(32).toString("hex");
        targetDevice.challenge = crypto.randomBytes(32).toString("hex");

        console.log(
          `🔐 Initiating secure handshake between Mobile (${mobileDevice.deviceId}) <-> Mac (${targetDevice.deviceId})`
        );

        // Send handshake initiation to both devices with peer's public key
        mobileDevice.socket.emit("handshake:initiate", {
          peerId: targetDevice.deviceId,
          peerPublicKey: targetDevice.publicKey,
          challenge: mobileDevice.challenge,
        });

        targetDevice.socket.emit("handshake:initiate", {
          peerId: mobileDevice.deviceId,
          peerPublicKey: mobileDevice.publicKey,
          challenge: targetDevice.challenge,
        });

        // Temporarily pair them - will be verified after handshake
        mobileDevice.pairedWith = targetDevice.deviceId;
        targetDevice.pairedWith = mobileDevice.deviceId;
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

  // Handle handshake response
  socket.on(
    "handshake:response",
    ({ peerId, signature }: { peerId: string; signature: string }) => {
      const device = devicesBySocket.get(socket.id);
      const peer = device?.pairedWith
        ? devicesById.get(device.pairedWith)
        : undefined;

      if (!device || !peer || peer.deviceId !== peerId) {
        socket.emit("error", { message: "Invalid handshake state" });
        return;
      }

      // Forward signature to peer for verification
      peer.socket.emit("handshake:verify", {
        peerId: device.deviceId,
        signature,
      });
    }
  );

  // Handle handshake confirmation
  socket.on("handshake:confirmed", () => {
    const device = devicesBySocket.get(socket.id);
    if (!device || !device.pairedWith) return;

    device.verified = true;
    const peer = devicesById.get(device.pairedWith);

    // Check if both devices are verified
    if (peer && device.verified && peer.verified) {
      console.log(
        `✅ Secure handshake completed: ${device.type} (${device.deviceId}) <-> ${peer.type} (${peer.deviceId})`
      );

      // Notify both devices that pairing is complete
      device.socket.emit("paired", {
        message: `Securely connected to ${peer.deviceName}`,
        peerId: peer.deviceId,
      });

      peer.socket.emit("paired", {
        message: `Securely connected to ${device.deviceName}`,
        peerId: device.deviceId,
      });

      // Trigger dimensions request if Mac is involved
      if (peer.type === "mac") {
        peer.socket.emit("request_dimensions");
      } else if (device.type === "mac") {
        device.socket.emit("request_dimensions");
      }

      // Update list for other mobiles
      if (device.userId) {
        notifyMobileClients(device.userId);
      }
    }
  });

  // ... Route messages ...
  // --- Helper to route messages ---
  const routeMessage = (eventName: string, data: unknown) => {
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

httpServer.listen(config.PORT, config.HOST, () => {
  console.log("🌐 MobiFai Relay Server (Google Auth Enabled)");
  console.log(`📡 Running on ${config.HOST}:${config.PORT}`);
  console.log(
    `🔗 Auth Callback URL: ${config.SERVER_URL}/auth/google/callback`
  );
  console.log("");
});
