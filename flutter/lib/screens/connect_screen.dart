import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:url_launcher/url_launcher.dart';
import 'package:app_links/app_links.dart';

import '../config.dart';
import '../theme/colors.dart';
import '../utils/crypto.dart';
import '../models/process.dart';

class ConnectScreen extends StatefulWidget {
  final VoidCallback onAuthenticated;

  const ConnectScreen({super.key, required this.onAuthenticated});

  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  bool _loading = false;
  String _statusMessage = '';
  io.Socket? _socket;
  KeyPair? _keyPair;
  late AppLinks _appLinks;

  @override
  void initState() {
    super.initState();
    _generateKeys();
    _initDeepLinks();
  }

  void _generateKeys() {
    try {
      _keyPair = CryptoUtils.generateKeyPair();
      debugPrint('🔐 Generated security keys');
    } catch (error) {
      debugPrint('❌ Failed to generate keys: $error');
    }
  }

  void _initDeepLinks() {
    _appLinks = AppLinks();

    // Handle incoming links when app is already running
    _appLinks.uriLinkStream.listen((Uri uri) {
      _handleDeepLink(uri);
    });

    // Handle initial link if app was opened via deep link
    _appLinks.getInitialLink().then((Uri? uri) {
      if (uri != null) {
        _handleDeepLink(uri);
      }
    });
  }

  Future<void> _handleDeepLink(Uri uri) async {
    debugPrint('🔗 Deep link received: $uri');

    if (uri.scheme == 'mobifai' && uri.host == 'auth') {
      try {
        final token = uri.queryParameters['token'];
        final email = uri.queryParameters['email'];

        if (token == null) {
          debugPrint('❌ Token not found in URL parameters');
          return;
        }

        debugPrint('✅ Extracted token for $email');

        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(Config.tokenKey, token);

        setState(() {
          _statusMessage = 'Authenticated as ${email ?? "User"}';
        });

        // Cleanup old socket
        _socket?.disconnect();
        _socket = null;

        // Create fresh socket connection with new token
        debugPrint('🔌 Creating new socket connection with token...');
        _connectWithToken(token);
      } catch (e) {
        debugPrint('❌ Failed to process deep link: $e');
      }
    }
  }

  void _connectWithToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    final deviceId = await _getDeviceId(prefs);

    _socket = io.io(
      Config.relayServerUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableReconnection()
          .enableForceNew()
          .setAuth({'token': token})
          .disableAutoConnect()
          .build(),
    );

    _socket!.onConnect((_) {
      debugPrint('✅ New socket connected, registering...');
      _socket!.emit('register', {
        'type': 'mobile',
        'token': token,
        'deviceId': deviceId,
        'publicKey': _keyPair?.publicKey,
      });
    });

    _socket!.on('authenticated', (data) async {
      debugPrint('✅ Server confirmed authentication');
      final user = data['user'] as Map<String, dynamic>;

      // Store user info
      final userInfo = UserInfo(
        email: user['email'] as String,
        name: user['name'] as String?,
        picture: user['picture'] as String?,
      );
      await prefs.setString(Config.userInfoKey, jsonEncode(userInfo.toJson()));

      setState(() {
        _statusMessage = 'Connected as ${user['email']}';
      });

      // Navigate to main tabs
      Future.delayed(const Duration(milliseconds: 500), () {
        _socket?.disconnect();
        widget.onAuthenticated();
      });
    });

    _setupHandshakeHandlers();

    _socket!.on('waiting_for_peer', (data) {
      setState(() {
        _statusMessage = data['message'] as String? ?? 'Waiting...';
      });
    });

    _socket!.onConnectError((error) {
      debugPrint('❌ Connect error: $error');
      setState(() {
        _statusMessage = 'Connection failed: $error';
        _loading = false;
      });
    });

    _socket!.connect();
  }

  void _setupHandshakeHandlers() {
    _socket?.on('handshake:initiate', (data) {
      final peerId = data['peerId'] as String;
      final peerPublicKey = data['peerPublicKey'] as String;
      final challenge = data['challenge'] as String;

      debugPrint('🔐 Starting secure handshake with $peerId...');

      try {
        if (_keyPair == null) {
          throw Exception('No key pair available');
        }

        // Derive shared secret
        final sharedSecret = CryptoUtils.deriveSharedSecret(
          _keyPair!.privateKey,
          peerPublicKey,
        );
        debugPrint('✅ Derived shared secret');

        // Sign the challenge
        final signature = CryptoUtils.signChallenge(challenge, sharedSecret);

        // Send response
        _socket?.emit('handshake:response', {
          'peerId': peerId,
          'signature': signature,
        });

        debugPrint('📤 Sent challenge response');
      } catch (error) {
        debugPrint('❌ Handshake failed: $error');
        _socket?.emit('error', {'message': 'Handshake failed'});
      }
    });

    _socket?.on('handshake:verify', (data) {
      final peerId = data['peerId'] as String;
      debugPrint('✅ Peer verified: $peerId');
      _socket?.emit('handshake:confirmed');
    });
  }

  Future<String> _getDeviceId(SharedPreferences prefs) async {
    var deviceId = prefs.getString(Config.deviceIdKey);
    if (deviceId == null) {
      deviceId = _generateUUID();
      await prefs.setString(Config.deviceIdKey, deviceId);
    }
    return deviceId;
  }

  String _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replaceAllMapped(
      RegExp(r'[xy]'),
      (match) {
        final r = (DateTime.now().millisecondsSinceEpoch % 16).toInt();
        final v = match.group(0) == 'x' ? r : (r & 0x3 | 0x8);
        return v.toRadixString(16);
      },
    );
  }

  Future<void> _handleConnect() async {
    setState(() {
      _loading = true;
      _statusMessage = 'Connecting to relay server...';
    });

    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(Config.tokenKey);
      final deviceId = await _getDeviceId(prefs);

      _socket = io.io(
        Config.relayServerUrl,
        io.OptionBuilder()
            .setTransports(['websocket'])
            .disableReconnection()
            .disableAutoConnect()
            .build(),
      );

      _socket!.onConnect((_) {
        debugPrint('✅ Socket connected');
        setState(() {
          _statusMessage = 'Connected. Checking authentication...';
        });
        _socket!.emit('register', {
          'type': 'mobile',
          'token': token,
          'deviceId': deviceId,
          'publicKey': _keyPair?.publicKey,
        });
      });

      _socket!.on('authenticated', (data) async {
        final user = data['user'] as Map<String, dynamic>;
        final newToken = data['token'] as String;

        debugPrint('✅ Authenticated as ${user['email']}');
        await prefs.setString(Config.tokenKey, newToken);

        // Store user info
        final userInfo = UserInfo(
          email: user['email'] as String,
          name: user['name'] as String?,
          picture: user['picture'] as String?,
        );
        await prefs.setString(Config.userInfoKey, jsonEncode(userInfo.toJson()));

        setState(() {
          _statusMessage = 'Authenticated as ${user['email']}';
        });

        // Navigate to main tabs
        Future.delayed(const Duration(milliseconds: 500), () {
          _socket?.disconnect();
          widget.onAuthenticated();
        });
      });

      _socket!.on('login_required', (data) async {
        final loginUrl = data['loginUrl'] as String;
        debugPrint('⚠️ Login required: $loginUrl');

        setState(() {
          _statusMessage = 'Authentication required';
        });

        final shouldLogin = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            backgroundColor: AppColors.bgSecondary,
            title: const Text(
              'Login Required',
              style: TextStyle(color: AppColors.textPrimary),
            ),
            content: const Text(
              'You need to sign in with Google to continue.',
              style: TextStyle(color: AppColors.textSecondary),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Sign In'),
              ),
            ],
          ),
        );

        if (shouldLogin == true) {
          final fullUrl = '${Config.relayServerUrl}$loginUrl';
          debugPrint('🔗 Opening URL: $fullUrl');

          final uri = Uri.parse(fullUrl);
          if (await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
            setState(() {
              _statusMessage =
                  'Waiting for authentication...\nComplete login in browser and return here.';
            });
          } else {
            _showError('Could not open browser');
          }
        } else {
          _socket?.disconnect();
          setState(() {
            _loading = false;
            _statusMessage = '';
          });
        }
      });

      _socket!.on('auth_error', (data) async {
        final message = data['message'] as String?;
        await prefs.remove(Config.tokenKey);
        _showError(message ?? 'Authentication error');
        _socket?.emit('register', {
          'type': 'mobile',
          'deviceId': deviceId,
          'publicKey': _keyPair?.publicKey,
        });
      });

      _socket!.onConnectError((error) {
        debugPrint('❌ Socket connect_error: $error');
        setState(() {
          _statusMessage = '';
          _loading = false;
        });
        _showError('Failed to connect to ${Config.relayServerUrl}\n$error');
      });

      _socket!.on('error', (data) {
        final message = data['message'] as String?;
        _showError(message ?? 'Unknown error');
      });

      _socket!.connect();
    } catch (error) {
      setState(() {
        _loading = false;
        _statusMessage = '';
      });
      _showError(error.toString());
    }
  }

  void _showError(String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.bgSecondary,
        title: const Text(
          'Error',
          style: TextStyle(color: AppColors.textPrimary),
        ),
        content: Text(
          message,
          style: const TextStyle(color: AppColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _socket?.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Logo
              const Text(
                '▣',
                style: TextStyle(
                  fontSize: 64,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'MobiFai',
                style: TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Mobile Terminal Access',
                style: TextStyle(
                  fontSize: 16,
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 48),

              // Connect button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _loading ? null : _handleConnect,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.textPrimary,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    disabledBackgroundColor:
                        AppColors.primary.withValues(alpha: 0.6),
                  ),
                  child: _loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor:
                                AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : const Text(
                          'Sign in with Google',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 24),

              // Status message
              if (_statusMessage.isNotEmpty)
                Text(
                  _statusMessage,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.primary,
                  ),
                  textAlign: TextAlign.center,
                )
              else
                const Text(
                  'Sign in with the same Google account on both Mac and mobile to connect securely.',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.textMuted,
                  ),
                  textAlign: TextAlign.center,
                ),

              const Spacer(),

              // Footer
              const Text(
                'Secure P2P Terminal Connection',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

