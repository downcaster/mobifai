# MobiFai Flutter App

Flutter port of the MobiFai mobile terminal application. Connects to Mac clients via WebRTC P2P for secure terminal access.

## Features

- **Native Terminal**: Uses xterm.dart for 60fps native Flutter terminal rendering
- **WebRTC P2P**: Direct peer-to-peer connection to Mac client
- **Socket.IO Signaling**: Relay server for connection establishment
- **ECDH Security**: Secure handshake with elliptic curve key exchange
- **Multi-Tab Support**: Multiple terminal tabs per connection
- **Google OAuth**: Authentication via Google sign-in
- **Terminal Themes**: 10 built-in themes (Classic, Dracula, Nord, etc.)

## Prerequisites

- Flutter SDK 3.9+
- Xcode (for iOS)
- Android Studio (for Android)
- Running Mac client and relay server

## Setup

1. **Install dependencies**:
   ```bash
   cd flutter
   flutter pub get
   ```

2. **iOS Setup** (for deep linking):
   - Open `ios/Runner/Info.plist` and add URL schemes if not present
   - The app uses `mobifai://` URL scheme for OAuth callback

3. **Configure relay server**:
   - Edit `lib/config.dart` to set your relay server URL
   - Or use `--dart-define=RELAY_SERVER_URL=https://your-server.com`

## Running

### iOS Simulator
```bash
flutter run -d iPhone
```

### iOS Device
```bash
flutter run -d <device-id>
```

### Android
```bash
flutter run -d android
```

## Testing with Mac Client

1. **Start the relay server**:
   ```bash
   cd ../relay-server
   npm start
   ```

2. **Start the Mac client**:
   ```bash
   cd ../mac-client
   npm start
   ```

3. **Run the Flutter app** and sign in with the same Google account used on the Mac client

4. **Connect**: Select your Mac from the device list to establish P2P connection

## Project Structure

```
lib/
├── main.dart                 # App entry point + navigation
├── config.dart               # Environment configuration
├── screens/
│   ├── connect_screen.dart   # OAuth login screen
│   ├── device_list_screen.dart  # Available Mac devices
│   ├── terminal_screen.dart  # Terminal with xterm.dart
│   └── profile_screen.dart   # Settings + logout
├── services/
│   ├── socket_service.dart   # Socket.IO client
│   └── webrtc_service.dart   # WebRTC P2P handling
├── utils/
│   └── crypto.dart           # ECDH key exchange
├── models/
│   └── process.dart          # Data models
├── theme/
│   ├── colors.dart           # App color palette
│   └── terminal_themes.dart  # Terminal color schemes
└── widgets/
    ├── app_button.dart       # Styled button
    └── app_card.dart         # Styled card
```

## Key Dependencies

| Package | Purpose |
|---------|---------|
| flutter_webrtc | WebRTC P2P connection |
| socket_io_client | Socket.IO signaling |
| xterm | Native terminal emulator |
| shared_preferences | Local storage |
| pointycastle | ECDH cryptography |
| app_links | Deep linking |
| url_launcher | OAuth browser flow |

## Differences from React Native Version

1. **Terminal Rendering**: Uses native xterm.dart instead of xterm.js in WebView
2. **Navigation**: Uses StatefulWidget with IndexedStack instead of React Navigation
3. **State Management**: Uses setState instead of React hooks
4. **Styling**: Flutter widgets instead of NativeWind/Tailwind

## Fallback

If xterm.dart proves insufficient for any terminal features, the fallback plan is to:
1. Use `webview_flutter` with the existing `terminal.html` from the React Native version
2. Communicate via `JavascriptChannel` instead of `postMessage`

## Troubleshooting

### WebRTC Connection Fails
- Ensure both devices are on the same network
- Check that the relay server is accessible
- Verify Google auth tokens match on both sides

### Terminal Not Rendering
- Check that the connection status shows "Connected"
- Verify terminal output is being received via WebRTC data channel
- Check console logs for any parsing errors

### Deep Linking Not Working
- Verify URL scheme is registered in Info.plist (iOS)
- For Android, check intent filters in AndroidManifest.xml
