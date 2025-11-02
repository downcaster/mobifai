# Quick Start Guide - MobiFai

Get your Mac terminal connected to your phone in 5 minutes!

## 📦 GitHub Repository

Clone or fork the project:
```bash
git clone git@github.com:patrykk21/mobifai.git
cd mobifai
```

Or visit: https://github.com/patrykk21/mobifai

## What You're Building

```
Your Mac  ←→  Relay Server (Cloud)  ←→  Your Phone
```

## Step 1: Start Relay Server (One Time Setup)

Choose one option:

### Option A: Run Locally (Testing)

```bash
cd relay-server
npm install
npm run dev
```

✅ Server running at `http://localhost:3000`

### Option B: Deploy to Railway (Free, Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
cd relay-server
railway login
railway init
railway up
```

✅ Server running at `https://your-project.railway.app`

---

## Step 2: Start Mac Client

```bash
cd mac-client
npm install

# Edit .env to point to your relay server
echo "RELAY_SERVER_URL=http://localhost:3000" > .env
# OR for Railway:
echo "RELAY_SERVER_URL=https://your-project.railway.app" > .env

# Start the client
npm run dev
```

You'll see:

```
🖥️  MobiFai Mac Client
================================

📡 Connecting to relay server: http://localhost:3000...
✅ Connected to relay server

✅ Mac registered. Share this code with your mobile device.

🔑 Pairing Code: 847392

Share this code with your mobile device to connect.
Code expires in 5 minutes.
```

**⚠️ COPY THE 6-DIGIT CODE!** You'll need it in the next step.

---

## Step 3: Setup Mobile App

### Option A: Use Expo Go on Physical Device (Easiest)

```bash
cd mobile
npm install
npm start
```

A QR code will appear:
1. Install **Expo Go** app from App Store (iOS) or Play Store (Android)
2. Scan QR code:
   - **iOS:** Use Camera app → tap "Open in Expo Go"
   - **Android:** Use Expo Go app to scan
3. App opens automatically in Expo Go

### Option B: Use iOS Simulator (Requires Xcode)

⚠️ **Requirement:** Xcode must be installed (12+ GB download from Mac App Store)

```bash
cd mobile
npm install
npx expo start --ios
```

This will launch the iOS Simulator automatically.

### Option C: Use Android Emulator (Requires Android Studio)

⚠️ **Requirement:** Android Studio must be installed

```bash
cd mobile
npm install
npx expo start --android
```

This will launch the Android Emulator automatically.

---

## Step 4: Connect!

In the mobile app:

1. **Enter Relay Server URL:**
   - Local: `http://localhost:3000`
   - Railway: `https://your-project.railway.app`

2. **Enter Pairing Code:** (from Step 2)
   - e.g., `847392`

3. **Tap "Connect"**

You'll see:

```
📡 Connecting to relay server...
✅ Connected to relay server
✅ Mobile device registered. Enter pairing code to connect.
🔗 Pairing with code: 847392...
✅ Successfully paired with Mac

========================================
Terminal ready. Start typing commands!
========================================
```

---

## Step 5: Try It Out!

Type commands in your phone:

```bash
ls
pwd
echo "Hello from my phone!"
cd ~/Documents
```

Everything runs on your Mac! 🎉

---

## Troubleshooting

### Mac Client Won't Connect

```bash
# Make sure relay server is running
curl http://localhost:3000/health

# Should return: {"status":"ok", ...}
```

### Mobile App Can't Pair

1. **Code expired?**
   - Codes expire after 5 minutes
   - Stop Mac client (Ctrl+C)
   - Restart it to get a new code

2. **Wrong relay server URL?**
   - Make sure URL matches exactly
   - Include `http://` or `https://`
   - For local: use your Mac's IP on same WiFi

3. **Already paired?**
   - Only one mobile per Mac
   - Disconnect other mobile first

### Terminal Not Responding

- Check Mac client logs for errors
- Try disconnecting and reconnecting
- Restart Mac client

---

## Using Over Internet (Not Local Network)

If you want to connect from anywhere:

### 1. Deploy Relay Server to Cloud

Use Railway, Heroku, or any hosting service (see Step 1, Option B)

### 2. Use Cloud URL

In Mac client `.env`:
```bash
RELAY_SERVER_URL=https://your-relay.railway.app
```

In mobile app:
```
https://your-relay.railway.app
```

Now it works from anywhere with internet! 🌐

---

## What's Next?

- ✅ You're connected and running commands!
- 📖 Read [README.md](README.md) for full documentation
- 🏗️ Read [ARCHITECTURE.md](ARCHITECTURE.md) to understand how it works
- 🚀 Deploy relay server for permanent access
- 📱 Build mobile app for App Store distribution

---

## Common Commands to Try

```bash
# System info
uname -a
uptime

# File operations
ls -la
cat somefile.txt
vim file.txt  # Full vim support!

# Process management
top
htop  # If installed

# Git operations
git status
git log --oneline

# Development
npm run build
docker ps
```

---

## Quick Reference

| Component | Default Port | Command |
|-----------|--------------|---------|
| Relay Server | 3000 | `cd relay-server && npm run dev` |
| Mac Client | - | `cd mac-client && npm run dev` |
| Mobile App | - | `cd mobile && npm start` |

### Files to Edit

- **Relay Server URL:** `mac-client/.env` (RELAY_SERVER_URL)
- **Relay Server Port:** `relay-server/.env` (PORT)

### Environment Files

```bash
# relay-server/.env
PORT=3000
NODE_ENV=development

# mac-client/.env
RELAY_SERVER_URL=http://localhost:3000
```

---

## Help & Support

- **Issues:** Check [README.md](README.md) troubleshooting section
- **Architecture:** Read [ARCHITECTURE.md](ARCHITECTURE.md)
- **Code:** All code is in TypeScript, well-documented

---

**🎉 Enjoy controlling your Mac from your phone!**
