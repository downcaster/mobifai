# MobiFai

**Connect your mobile phone to your Mac terminal through an external relay server.** Control your Mac terminal from anywhere in the world!

📦 **GitHub Repository:** https://github.com/patrykk21/mobifai
📖 **Quick Start:** See [QUICKSTART.md](QUICKSTART.md)
🏗️ **Architecture:** See [ARCHITECTURE.md](ARCHITECTURE.md)

## 🏗️ Architecture

```
┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
│              │         │                  │         │              │
│  Mac Client  │←────────│  Relay Server    │────────→│  iOS App     │
│  (Terminal)  │  WebSocket  (Cloud/VPS)   │  WebSocket  (Controls)   │
│              │         │                  │         │              │
└──────────────┘         └──────────────────┘         └──────────────┘
      ↓                         │                           ↓
  Runs zsh/bash           Routes messages              Sends commands
```

**Key Features:**
- 🌐 **External Relay Server** - Deploy anywhere (Heroku, AWS, VPS)
- 💻 **Mac Client** - Runs on your Mac, executes terminal commands
- 📱 **Mobile App** - Bare React Native app for iOS & Android
- ⚡ **WebRTC P2P** - Direct peer-to-peer connection with automatic relay fallback
- 🔒 **Secure Authentication** - Google OAuth 2.0 login on both devices
- 🛡️ **Crypto Handshake** - ECDH Key Exchange + HMAC signatures for device verification
- 🚀 **Real-time** - Full terminal emulation with `node-pty`

## 🔐 Security & Authentication Flow

MobiFai uses a robust security model to ensure only **your** devices can connect to your terminal.

### 1. Identity Verification (Google OAuth)
Both the Mac Client and Mobile App must authenticate with the same Google Account.
- **Mac Client:** Opens a browser window to sign in.
- **Mobile App:** Opens a browser window to sign in.
- **Relay Server:** Verifies JWT tokens and ensures both devices belong to the same `user.email`.

### 2. Device Registration
Upon connection, each device registers with the Relay Server:
- Generates an ephemeral **ECDH Key Pair** (secp256k1).
- Sends the **Public Key** to the server.
- Server stores the `publicKey` associated with the authenticated session.

### 3. Secure Handshake (Mutual Authentication)
When the Mobile App requests a connection to a Mac:
1. **Initiation:** Server verifies both devices are online and belong to the same user.
2. **Challenge Generation:** Server generates a random 32-byte challenge for each device.
3. **Key Exchange:** Server sends the peer's `publicKey` and the challenge to each device.
4. **Shared Secret Derivation:**
   - Devices use **ECDH** (Elliptic Curve Diffie-Hellman) to derive a `sharedSecret` using their private key and the peer's public key.
   - `sharedSecret = ECDH(myPrivateKey, peerPublicKey)`
5. **Signing:** Each device signs the server's challenge using **HMAC-SHA256** with the `sharedSecret`.
6. **Verification:**
   - Device A sends signature to Server.
   - Server forwards signature to Device B.
   - Device B verifies signature (proving Device A derived the same secret) and sends confirmation.
   - (Process repeats for B → A)
7. **Connection:** Once both devices have confirmed the peer's identity, the server establishes the P2P signaling bridge.

This ensures that even if the Relay Server is compromised, it cannot impersonate a device without the ephemeral private keys (which never leave the device).

## 📦 Project Structure

```
mobifai/
├── relay-server/        # External server (deploy to cloud)
│   └── src/
│       └── index.ts     # Relay/signaling server
│
├── mac-client/          # Mac terminal client
│   └── src/
│       └── index.ts     # Connects to relay + runs terminal
│
└── mobile/              # React Native app (iOS & Android)
    ├── src/
    │   ├── screens/
    │   │   ├── ConnectScreen.tsx
    │   │   └── TerminalScreen.tsx
    │   └── App.tsx
```

## 🚀 Quick Start

### 1. Deploy Relay Server (One Time)

The relay server acts as the secure meeting point.

```bash
cd relay-server
npm install
# Configure Google OAuth credentials in .env
npm run build
npm start
```

### 2. Start Mac Client

```bash
cd mac-client
npm install
# Configure RELAY_SERVER_URL in .env
npm start
```

1. The client will generate a secure link.
2. Press `Enter` to open the login page.
3. Sign in with your Google Account.
4. "✅ Authenticated" will appear in the terminal.

### 3. Connect from Mobile

```bash
cd mobile
# Configure RELAY_SERVER_URL in src/config.ts
npx react-native run-ios
```

1. Open the app.
2. Tap **"Connect with Google"**.
3. Sign in with the **SAME** Google Account used on the Mac.
4. You will see your Mac in the "Terminals" list.
5. Tap "Connect" to start the secure session!

## 🖥️ Running on MacBook

### Complete Setup Flow

**Terminal 1: Start Relay Server**
```bash
cd relay-server
npm start
```

**Terminal 2: Start Mac Client**
```bash
cd mac-client
npm start
```

**Terminal 3: Start Mobile App**
```bash
cd mobile
npx react-native run-ios
```

## 🔄 How It Works

### Connection Flow
1. **Mac Client** connects to relay, authenticates via Google.
2. **Mobile App** connects to relay, authenticates via Google.
3. **Relay Server** notifies Mobile App of available Mac devices (matching User ID).
4. **User** selects Mac device.
5. **Secure Handshake** ensures devices share cryptographic secrets.
6. **WebRTC P2P** connection is established for low-latency terminal stream.

### Communication Flow
- **P2P Mode** (preferred): Mobile ↔ Mac (direct WebRTC data channel)
- **Relay Mode** (fallback): Mobile ↔ Relay Server ↔ Mac (Socket.IO)

The relay server acts as a signaling server for WebRTC and provides fallback communication. It routes encrypted messages in fallback mode.

### iOS Simulator Note
⚠️ **WebRTC P2P does not work in iOS Simulator** due to network isolation limitations. The app automatically falls back to relay mode. P2P works perfectly on **real iOS devices**.

## 🌍 Deployment Options

### Relay Server

| Platform | Free Tier | Setup Difficulty | Best For |
|----------|-----------|------------------|----------|
| **Heroku** | ✅ Yes | Easy | Quick prototyping |
| **Railway** | ✅ Yes | Easy | Modern deployment |
| **Fly.io** | ✅ Yes | Medium | Global edge deployment |
| **DigitalOcean** | ❌ $5/mo | Medium | Full control |
| **AWS EC2** | ⚠️ Free tier | Hard | Enterprise |
| **Cloudflare Workers** | ✅ Yes | Hard | WebSocket limits |

## 🔧 Environment Variables

### Relay Server (.env)

```bash
PORT=3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=...
ALLOWED_EMAILS=... (Optional: restrict access)
```

### Mac Client (.env)

```bash
RELAY_SERVER_URL=https://your-relay-server.com
```

## 📱 Mobile App - Building for Production

### iOS

```bash
cd mobile
npx react-native run-ios --configuration Release
```

### Android

```bash
cd mobile
npx react-native run-android --variant=release
```

## 🔐 Security Considerations

**Current Implementation:**
- ✅ **Google OAuth 2.0** Authentication
- ✅ **ECDH Key Exchange** for session security
- ✅ **HMAC Verification** of handshake challenges
- ✅ **One-to-One** secure binding
- ✅ **Ephemeral Keys** (generated per session)

**For Production:**
1. **Use HTTPS/WSS** - Deploy relay server with SSL (Required for production OAuth).
2. **E2E Encryption** - Use the shared secret to encrypt the actual terminal data stream (currently handshake uses it for verification).

## 🐛 Troubleshooting

### Mac Client Won't Connect
```bash
# Check relay server is running
curl https://your-relay-server.com/health
```

### Mobile App Can't See Mac
1. Ensure both are logged in with the **SAME** email.
2. Check Mac client log says `✅ Authenticated`.
3. Pull down on the device list to refresh.

### Terminal Not Responding
- Check Mac client terminal logs.
- Ensure Mac client didn't crash.
- Try disconnecting and reconnecting mobile app.

### WebRTC P2P Not Connecting
- **iOS Simulator**: P2P doesn't work in simulator - use a real device.
- **Real Device**: Check that both devices are on the same network or have accessible IPs.
- **Fallback**: App automatically uses relay server if P2P fails.
- **Status**: Check mobile app status bar - shows "P2P Connected ⚡" or "Paired (Relay)".

## 🎯 Use Cases

- 📊 **Remote Server Management** - Control your Mac from anywhere
- 🏠 **Home Automation** - Run scripts on your home Mac
- 🔧 **Development** - Quick terminal access on the go
- 🎮 **Gaming** - Start game servers remotely
- 🤖 **Bot Commands** - Trigger builds, deployments, etc.

## 📄 API Reference

### Relay Server WebSocket Events

#### Client → Server

- `register` - Register device (mac or mobile)
  ```javascript
  socket.emit('register', { 
    type: 'mac' | 'mobile', 
    token: 'JWT...',
    publicKey: 'hex...' 
  });
  ```

- `request_connection` - Request to connect to a peer
  ```javascript
  socket.emit('request_connection', { targetDeviceId: '...' });
  ```

- `handshake:response` - Respond to security challenge
  ```javascript
  socket.emit('handshake:response', { signature: 'hex...' });
  ```

#### Server → Client

- `authenticated` - Authentication successful
- `handshake:initiate` - Start secure handshake
- `paired` - Devices paired successfully
- `terminal:output` - Receive terminal output
- `terminal:input` - Receive terminal input

## 📜 License

MIT

## 🙏 Contributing

Pull requests are welcome! For major changes, please open an issue first.

## 🎉 Credits

Built with:
- [Socket.IO](https://socket.io/) - Real-time communication
- [node-pty](https://github.com/microsoft/node-pty) - Terminal emulation
- [React Native](https://reactnative.dev/) - Mobile app
- [react-native-quick-crypto](https://github.com/margelo/react-native-quick-crypto) - High performance crypto
- [elliptic](https://github.com/indutny/elliptic) - Elliptic curve cryptography
- [TypeScript](https://www.typescriptlang.org/) - Type safety

---

**Made with ❤️ for remote terminal access**
