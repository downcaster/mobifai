# MobiFai Configuration Guide

All three applications now use **strict environment validation** that will prevent the app from starting if required variables are missing or have incorrect types.

## 🔍 Find Your Mac's IP Address

Run this command in your terminal:
```bash
ipconfig getifaddr en0
```

This will output something like: `192.168.178.7`

**Use this IP in all configurations below.**

---

## 1. Relay Server Configuration

### Create `relay-server/.env`

```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Server URL (IMPORTANT: Use your Mac's IP, NOT localhost or 0.0.0.0)
SERVER_URL=http://192.168.178.7:3000

# Google OAuth
# Get these from: https://console.cloud.google.com
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# JWT Secret (generate a random string)
JWT_SECRET=your-very-secure-random-secret-key-here

# Session Cookie Key (generate a random string)
COOKIE_KEY=your-session-cookie-secret-key-here

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mobifai
```

### Validation Rules:
- ✅ `SERVER_URL` must be a valid URL
- ✅ `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `DATABASE_URL` are **required**
- ✅ `PORT` must be a number
- ✅ App will **not start** if any required variable is missing

---

## 2. Mac Client Configuration

### Create `mac-client/.env`

```bash
# Relay Server URL (use your Mac's IP)
RELAY_SERVER_URL=http://192.168.178.7:3000

# Optional: Debug mode
DEBUG=false
```

### Validation Rules:
- ✅ `RELAY_SERVER_URL` must be a valid URL
- ✅ `RELAY_SERVER_URL` is **required**
- ✅ App will **not start** if missing

---

## 3. Mobile App Configuration

### Edit `mobile/src/config.ts`

Since React Native doesn't have built-in .env support, edit the file directly:

```typescript
const ENV_CONFIG = {
  RELAY_SERVER_URL: 'http://192.168.178.7:3000', // ⚠️ CHANGE THIS
  DEBUG: 'false',
};
```

### Important Notes:
- **For Physical iPhone**: Use your Mac's IP (e.g., `192.168.178.7`)
- **For iOS Simulator**: Can use `localhost:3000` since simulator shares Mac's network
- **Both devices must be on the same Wi-Fi network**

### Validation Rules:
- ✅ `RELAY_SERVER_URL` must be a valid URL
- ✅ Will warn you if using placeholder values
- ✅ Will warn if using localhost (only works in simulator)
- ✅ App will **not start** if missing or invalid

---

## 🚀 Quick Start

### 1. Setup Environment Variables

```bash
# Relay Server
cd relay-server
cp .env.example .env  # If you create one
# Edit .env with your values

# Mac Client
cd ../mac-client
echo "RELAY_SERVER_URL=http://YOUR_IP:3000" > .env
# Replace YOUR_IP with your actual IP

# Mobile App
cd ../mobile
# Edit src/config.ts directly
```

### 2. Build Everything

```bash
# Terminal 1: Relay Server
cd relay-server
npm install
npm run build
npm start

# Terminal 2: Mac Client
cd mac-client
npm install
npm run build
npm start

# Terminal 3: Mobile App
cd mobile
npm install
# For iOS:
npx pod-install
npx react-native run-ios
```

---

## ✅ Verification

### Relay Server
You should see:
```
📋 Configuration loaded:
   PORT: 3000
   HOST: 0.0.0.0
   NODE_ENV: development
   SERVER_URL: http://192.168.178.7:3000
   DATABASE: localhost:5432/mobifai

🌐 MobiFai Relay Server (Google Auth Enabled)
📡 Running on 0.0.0.0:3000
🔗 Auth Callback URL: http://192.168.178.7:3000/auth/google/callback
```

### Mac Client
You should see:
```
📋 Configuration loaded:
   Relay Server: http://192.168.178.7:3000
   Debug Mode: disabled

🖥️  MobiFai Mac Client
================================

📡 Connecting to relay server: http://192.168.178.7:3000...
```

### Mobile App
You should see in the console:
```
📋 Mobile Configuration loaded:
   Relay Server: http://192.168.178.7:3000
   Debug Mode: disabled
```

---

## ❌ Common Errors

### Error: Missing required environment variable 'SERVER_URL'
**Fix**: Create `.env` file with `SERVER_URL=http://YOUR_IP:3000`

### Error: Environment variable 'PORT' must be a number
**Fix**: Make sure `PORT=3000` (not `PORT="3000"` or `PORT=three thousand`)

### Error: Environment variable 'RELAY_SERVER_URL' must be a valid URL
**Fix**: Make sure URL starts with `http://` or `https://`

### Mobile app can't connect
**Fix**: 
- Make sure you're using your Mac's IP, not `localhost` or `0.0.0.0`
- Make sure both devices are on the same Wi-Fi network
- Make sure relay server is running

---

## 🔐 Google OAuth Setup

1. Go to https://console.cloud.google.com
2. Create a new project or select existing
3. Enable "Google+ API"
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://192.168.178.7:3000/auth/google/callback`
6. Copy Client ID and Client Secret to `relay-server/.env`

---

## 📝 TypeScript Validation

All configs now have:
- ✅ **No `any` types** - everything is properly typed
- ✅ **Strict validation** - throws errors for missing/invalid values
- ✅ **Type checking** - numbers must be numbers, URLs must be URLs
- ✅ **Early failure** - app won't start with bad config

This prevents runtime errors and makes debugging easier!

