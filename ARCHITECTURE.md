# MobiFai Architecture

## Overview

MobiFai uses a **relay server architecture** where an external server facilitates peer-to-peer-style communication between your Mac and mobile device.

## Architecture Diagram

```
                    ┌─────────────────────┐
                    │   Relay Server      │
                    │   (External/Cloud)  │
                    │                     │
                    │   - Message router  │
                    │   - Pairing codes   │
                    │   - Device registry │
                    └─────────┬───────────┘
                              │
                 ┌────────────┴────────────┐
                 │                         │
          WebSocket                   WebSocket
                 │                         │
        ┌────────▼────────┐       ┌───────▼────────┐
        │   Mac Client    │       │   iOS App      │
        │   (Your Mac)    │       │   (Your Phone) │
        │                 │       │                │
        │ - Connects      │       │ - Connects     │
        │ - Gets code     │       │ - Enters code  │
        │ - Runs terminal │       │ - Sends cmds   │
        │ - Sends output  │       │ - Shows output │
        └─────────────────┘       └────────────────┘
```

## Components

### 1. Relay Server (External)

**Purpose:** Routes messages between Mac and iOS devices

**Location:** Deploy anywhere (Heroku, Railway, AWS, VPS, local network)

**Responsibilities:**
- Accept connections from Mac and iOS clients
- Generate and manage pairing codes
- Pair devices together
- Route `terminal:input` from iOS → Mac
- Route `terminal:output` from Mac → iOS
- Handle disconnections and cleanup

**Technology:** Node.js + Express + Socket.IO

### 2. Mac Client

**Purpose:** Runs on your Mac, executes terminal commands

**Location:** Your Mac (local machine)

**Responsibilities:**
- Connect to relay server
- Receive pairing code
- Spawn terminal process (`node-pty`)
- Send terminal output to relay server
- Receive terminal input from relay server
- Execute commands locally

**Technology:** Node.js + Socket.IO Client + node-pty + Chalk

### 3. Mobile App (iOS/Android)

**Purpose:** Mobile interface to control the terminal

**Location:** Your phone (iOS or Android)

**Responsibilities:**
- Connect to relay server
- Send pairing code to connect with Mac
- Send terminal commands to relay server
- Display terminal output from relay server
- Handle user input (keyboard)

**Technology:** React Native + Expo + Socket.IO Client

## Message Flow

### 1. Pairing Flow

```
Mac Client                 Relay Server              Mobile App
    |                            |                        |
    |─── connect ────────────────>|                        |
    |<── registered + code ───────|                        |
    |                            |                        |
    |                            |<─── connect ───────────|
    |                            |─── registered ─────────>|
    |                            |                        |
    |                            |<─── pair(code) ────────|
    |<── paired ─────────────────|                        |
    |                            |─── paired ─────────────>|
```

### 2. Terminal Communication Flow

```
Mobile App                 Relay Server              Mac Client
    |                            |                        |
    |─── terminal:input ────────>|                        |
    |    "ls -la\n"             |                        |
    |                            |─── terminal:input ────>|
    |                            |    "ls -la\n"         |
    |                            |                        |
    |                            |<── terminal:output ────|
    |<── terminal:output ────────|    "file1.txt\n..."   |
    |    "file1.txt\n..."       |                        |
```

## WebSocket Events

### Registration Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `register` | Client → Server | `{ type: 'mac' \| 'mobile' }` | Register device with server |
| `registered` | Server → Client | `{ type, pairingCode?, message }` | Confirm registration |

### Pairing Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `pair` | Mobile → Server | `{ pairingCode: string }` | Pair with Mac using code |
| `paired` | Server → Client | `{ message, macId/mobileId }` | Pairing successful |
| `paired_device_disconnected` | Server → Client | `{ message }` | Paired device disconnected |

### Terminal Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `terminal:input` | Mobile → Server → Mac | `string` | Command input |
| `terminal:output` | Mac → Server → Mobile | `string` | Terminal output |
| `terminal:resize` | Mobile → Server → Mac | `{ cols, rows }` | Resize terminal |

### Error Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `error` | Server → Client | `{ message: string }` | Error occurred |

## Security Model

### Current Implementation

1. **Pairing Codes**
   - 6-digit random codes
   - Expire after 5 minutes
   - Single-use only
   - Generated by relay server

2. **Device Pairing**
   - One mobile device per Mac at a time
   - Codes cleared after use
   - Automatic cleanup on disconnect

3. **Message Routing**
   - Server only routes to paired devices
   - No persistent storage
   - No command logging

### Security Limitations

⚠️ **Warning:** Current implementation is for development/personal use

**Missing Features:**
- ❌ No end-to-end encryption
- ❌ No authentication beyond pairing
- ❌ No rate limiting
- ❌ No audit logging
- ❌ Relay server can see all traffic

### Production Recommendations

For production use, implement:

1. **Transport Security**
   - Use HTTPS/WSS (TLS/SSL)
   - Deploy relay server with valid certificates
   - Use Let's Encrypt for free SSL

2. **End-to-End Encryption**
   - Encrypt terminal output before sending
   - Decrypt on receiving device
   - Use WebCrypto API or similar

3. **Authentication**
   - Add user accounts
   - JWT tokens for sessions
   - Refresh token mechanism

4. **Rate Limiting**
   - Limit pairing attempts
   - Throttle message rates
   - DDoS protection

5. **Audit Logging**
   - Log connections
   - Track pairing attempts
   - Monitor for abuse

## Deployment Scenarios

### Scenario 1: Local Network Only

```
Mac Client ──→ Relay Server (Mac) ──→ Mobile App
              http://192.168.1.x:3000
```

- Run relay server on your Mac
- Connect mobile to same WiFi
- No internet required

### Scenario 2: Cloud Relay (Recommended)

```
Mac Client ──→ Relay Server (Heroku) ──→ Mobile App
              https://my-relay.herokuapp.com
```

- Deploy relay server to cloud
- Both devices connect to cloud
- Works from anywhere with internet

### Scenario 3: VPS Relay

```
Mac Client ──→ Relay Server (VPS) ──→ Mobile App
              https://relay.yourdomain.com
```

- Self-hosted on VPS
- Full control
- Custom domain + SSL

## Performance Considerations

### Latency

**Typical Latency:**
- Local network: 10-50ms
- Cloud relay (same region): 50-200ms
- Cloud relay (different region): 200-500ms

**Optimization:**
- Deploy relay server close to Mac
- Use WebSocket compression
- Minimize message frequency

### Bandwidth

**Typical Usage:**
- Idle: ~1KB/s (heartbeats)
- Light terminal use: ~5KB/s
- Heavy output: ~50KB/s

**Optimization:**
- Buffer small messages
- Compress terminal output
- Limit output rate

### Scalability

**Current Limits:**
- 1 Mac : 1 Mobile pairing
- Unlimited Mac clients per relay
- Unlimited mobile apps per relay

**Scaling Relay Server:**
- Use Redis for session storage
- Load balance with multiple instances
- Use sticky sessions for WebSocket

## Why This Architecture?

### Alternatives Considered

#### 1. Direct Connection (P2P)
```
Mac Client ←─ WebRTC ─→ Mobile App
```

**Pros:** Lowest latency, no relay needed
**Cons:** NAT traversal complex, requires TURN server anyway

#### 2. Mac as Server
```
Mac Client (Server) ←─ Direct ─→ Mobile App
```

**Pros:** Simple, no external server
**Cons:** Can't reach Mac behind NAT/firewall, dynamic IP issues

#### 3. VPN Tunnel
```
Mac ←─ VPN ─→ Mobile
```

**Pros:** Secure, works anywhere
**Cons:** Complex setup, requires VPN server

### Why Relay Server Wins

✅ **Simple setup** - Just run relay anywhere
✅ **NAT friendly** - Both devices connect out
✅ **Works anywhere** - Internet required but easy
✅ **Scalable** - Can handle many Mac-Mobile pairs
✅ **Debuggable** - Relay server can log for debugging
✅ **Flexible** - Easy to add features (recording, sharing, etc.)

## Future Architecture Improvements

### 1. End-to-End Encryption

```javascript
// Mac
const encrypted = await encrypt(terminalOutput, sharedKey);
socket.emit('terminal:output', encrypted);

// Mobile
const decrypted = await decrypt(received, sharedKey);
```

### 2. Multiple Terminal Sessions

```
Mac Client ─┬─ Session 1 ─┐
            ├─ Session 2 ──┤─→ Relay ─→ Mobile App (tabs)
            └─ Session 3 ─┘
```

### 3. File Transfer

```
Mobile ─→ Upload ─→ Relay ─→ Mac ─→ Save
Mac ─→ Read ─→ Relay ─→ Download ─→ Mobile
```

### 4. Screen Sharing

```
Mac ─→ Screenshots ─→ Relay ─→ Mobile (view only)
```

### 5. Multi-User Support

```
Mac ─┬─ User 1 Mobile
     ├─ User 2 Mobile
     └─ User 3 Mobile (with permissions)
```

## Development Workflow

### Running Locally

1. **Start Relay Server**
   ```bash
   cd relay-server && npm run dev
   ```

2. **Start Mac Client**
   ```bash
   cd mac-client && npm run dev
   ```

3. **Start Mobile App**
   ```bash
   cd mobile && npm start
   ```

### Testing

- **Unit Tests:** Test each component independently
- **Integration Tests:** Test WebSocket communication
- **E2E Tests:** Test full pairing + terminal flow

### Debugging

- **Relay Server:** Check console logs for connections
- **Mac Client:** Colorful chalk logs show status
- **Mobile App:** React Native debugger shows state

## Monitoring

### Health Checks

```bash
# Check relay server
curl https://relay.yourdomain.com/health

# Response:
{
  "status": "ok",
  "timestamp": "...",
  "connectedDevices": {
    "mac": 2,
    "mobile": 3
  }
}
```

### Metrics to Track

- Connected devices (mac/mobile)
- Active pairings
- Messages per second
- Average latency
- Error rates
- Pairing success rate

---

**Last Updated:** 2025-11-02

**Architecture Version:** 1.0.0 (Relay-based)
