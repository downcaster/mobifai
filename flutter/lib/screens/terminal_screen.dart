import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:uuid/uuid.dart';
import 'package:xterm/xterm.dart';

import '../config.dart';
import '../theme/colors.dart';
import '../theme/terminal_themes.dart' as app_themes;
import '../models/process.dart';
import '../utils/crypto.dart';
import '../services/webrtc_service.dart';

class TerminalScreen extends StatefulWidget {
  final String? relayServerUrl;
  final String? targetDeviceId;
  final VoidCallback onBack;

  const TerminalScreen({
    super.key,
    this.relayServerUrl,
    this.targetDeviceId,
    required this.onBack,
  });

  @override
  State<TerminalScreen> createState() => _TerminalScreenState();
}

class _TerminalScreenState extends State<TerminalScreen> {
  // Connection state
  bool _connected = false;
  bool _paired = false;
  bool _webrtcConnected = false;
  String _connectionStatus = 'Connecting...';
  bool _copyFeedback = false;

  // Process management
  final List<TerminalProcess> _processes = [];
  String? _activeProcessUuid;
  int _processCounter = 0;
  final Set<String> _loadingProcesses = {};
  bool _syncingTabs = false;
  bool _firstProcessCreated = false;

  // Terminal
  late Terminal _terminal;
  late TerminalController _terminalController;
  app_themes.TerminalTheme _currentTheme =
      app_themes.TerminalThemes.defaultTheme;

  // Services
  io.Socket? _socket;
  WebRTCService? _webrtc;

  // Security
  KeyPair? _keyPair;
  Uint8List? _sharedSecret;

  // AI
  bool _aiModalVisible = false;
  String _aiPrompt = '';
  bool _aiProcessing = false;
  String? _aiToastMessage;
  Timer? _toastTimer;

  final _uuid = const Uuid();

  @override
  void initState() {
    super.initState();
    print('🚀 TerminalScreen initState called');
    print('   relayServerUrl: ${widget.relayServerUrl}');
    print('   targetDeviceId: ${widget.targetDeviceId}');
    print('   _hasConnectionParams: $_hasConnectionParams');

    _initTerminal();

    if (_hasConnectionParams) {
      print('✅ Has connection params, starting connection...');
      _generateKeys();
      _connectToRelay();
      _fetchSettings();
    } else {
      print('⚠️ No connection params, showing not connected state');
    }
  }

  bool get _hasConnectionParams => widget.relayServerUrl != null;

  void _initTerminal() {
    _terminal = Terminal(maxLines: 10000);

    _terminalController = TerminalController();

    // Handle terminal input - forward to Mac
    _terminal.onOutput = (data) {
      _sendTerminalInput(data);
    };
  }

  void _generateKeys() {
    try {
      _keyPair = CryptoUtils.generateKeyPair();
      debugPrint('🔐 Terminal: Generated session keys');
    } catch (error) {
      debugPrint('❌ Terminal: Failed to generate keys: $error');
      _showError('Security Error', 'Failed to generate encryption keys');
    }
  }

  Future<void> _fetchSettings() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(Config.tokenKey);
      if (token == null) return;

      // For now, use default theme
      // TODO: Implement HTTP settings fetch
      _applyTheme(_currentTheme);
    } catch (error) {
      debugPrint('Error fetching settings: $error');
    }
  }

  void _applyTheme(app_themes.TerminalTheme theme) {
    setState(() {
      _currentTheme = theme;
    });
  }

  Future<String> _getDeviceId() async {
    final prefs = await SharedPreferences.getInstance();
    var deviceId = prefs.getString(Config.deviceIdKey);
    if (deviceId == null) {
      deviceId = _uuid.v4();
      await prefs.setString(Config.deviceIdKey, deviceId);
    }
    return deviceId;
  }

  void _connectToRelay() async {
    setState(() {
      _connectionStatus = '📡 Connecting to relay server...';
    });

    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(Config.tokenKey);
    final deviceId = await _getDeviceId();

    debugPrint('Device ID: $deviceId');

    _socket = io.io(
      widget.relayServerUrl!,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .setReconnectionAttempts(5)
          .setAuth({'token': token})
          .disableAutoConnect() // Important: disable auto-connect to set up handlers first
          .build(),
    );

    _socket!.onConnect((_) {
      print('🔌 Socket connected to ${widget.relayServerUrl}');
      setState(() {
        _connected = true;
        _connectionStatus = '✅ Connected to relay server';
      });

      print('📤 Emitting register event...');
      _socket!.emit('register', {
        'type': 'mobile',
        'token': token,
        'deviceId': deviceId,
        'publicKey': _keyPair?.publicKey,
      });
    });

    // Handle secure handshake
    _socket!.on('handshake:initiate', (data) {
      _handleHandshakeInitiate(data as Map<String, dynamic>);
    });

    _socket!.on('handshake:verify', (data) {
      final peerId = data['peerId'] as String;
      debugPrint('✅ Handshake verified for $peerId');
      _socket!.emit('handshake:confirmed');
    });

    _socket!.on('settings:updated', (newSettings) {
      if (newSettings != null) {
        debugPrint('⚙️ Received settings update: $newSettings');
        final themeId = newSettings['terminalTheme'] as String?;
        if (themeId != null) {
          _applyTheme(app_themes.TerminalThemes.getById(themeId));
        }
      }
    });

    _socket!.on('login_required', (data) {
      _showError(
        'Authentication Required',
        'You need to log in with Google to connect.',
      );
    });

    _socket!.on('authenticated', (data) async {
      debugPrint('📥 Received authenticated event: $data');
      final user = data['user'] as Map<String, dynamic>;
      final newToken = data['token'] as String;

      debugPrint('✅ Authenticated as ${user['email']}');
      await prefs.setString(Config.tokenKey, newToken);
      setState(() {
        _connectionStatus = '✅ Logged in as ${user['email']}';
      });

      // Request connection to target device
      if (widget.targetDeviceId != null) {
        debugPrint('🔌 Requesting connection to: ${widget.targetDeviceId}');
        setState(() {
          _connectionStatus = '🔗 Requesting connection...';
        });
        debugPrint('📤 Emitting request_connection...');
        _socket!.emit('request_connection', {
          'targetDeviceId': widget.targetDeviceId,
        });
      } else {
        debugPrint('⚠️ No targetDeviceId set, skipping request_connection');
      }
    });

    _socket!.on('auth_error', (data) async {
      final message = data['message'] as String?;
      debugPrint('❌ Auth Error: $message');
      await prefs.remove(Config.tokenKey);
      _socket!.emit('register', {'type': 'mobile', 'deviceId': deviceId});
    });

    _socket!.on('waiting_for_peer', (data) {
      final message = data['message'] as String?;
      setState(() {
        _connectionStatus = '⏳ ${message ?? "Waiting..."}';
      });
    });

    _socket!.on('paired', (data) {
      debugPrint('📥 Received paired event: $data');
      final message = data['message'] as String?;
      setState(() {
        _paired = true;
        _syncingTabs = true;
        _connectionStatus = '';
      });
      debugPrint('✅ Paired: $message');

      // Initialize WebRTC P2P connection
      debugPrint('🔗 Initializing WebRTC P2P connection...');
      _initWebRTC();
    });

    _socket!.on('system:message', (data) {
      final type = data['type'] as String?;
      if (type == 'terminal_ready') {
        debugPrint('✅ Terminal ready on Mac side');
        setState(() {
          _connectionStatus = '';
        });
      }
    });

    // Process-related socket events
    _socket!.on('processes:sync', (payload) {
      _handleProcessMessage('processes:sync', payload);
    });
    _socket!.on('process:created', (payload) {
      _handleProcessMessage('process:created', payload);
    });
    _socket!.on('process:terminated', (payload) {
      _handleProcessMessage('process:terminated', payload);
    });
    _socket!.on('process:exited', (payload) {
      _handleProcessMessage('process:exited', payload);
    });
    _socket!.on('process:screen', (payload) {
      _handleProcessMessage('process:screen', payload);
    });
    _socket!.on('process:error', (payload) {
      _handleProcessMessage('process:error', payload);
    });

    // Terminal output via socket (fallback)
    _socket!.on('terminal:output', (data) {
      if (!(_webrtc?.isWebRTCConnected ?? false)) {
        _handleProcessMessage('terminal:output', data);
      }
    });

    _socket!.on('paired_device_disconnected', (data) {
      final message = data['message'] as String?;

      if (_webrtc?.isWebRTCConnected ?? false) {
        debugPrint(
          '⚠️  Relay server disconnected, but P2P connection is still active',
        );
        _terminal.write(
          '\r\n\x1b[33m⚠️  Relay server disconnected (P2P still active)\x1b[0m\r\n',
        );
        return;
      }

      setState(() {
        _paired = false;
        _webrtcConnected = false;
        _syncingTabs = false;
        _firstProcessCreated = false;
        _processes.clear();
        _activeProcessUuid = null;
      });

      _terminal.write('\r\n\x1b[33m⚠️  $message\x1b[0m\r\n');
      _terminal.write(
        '\r\n\x1b[36mTerminals are kept alive on Mac. Reconnect to restore.\x1b[0m\r\n',
      );

      _showError(
        'Disconnected',
        '$message\n\nYour terminals are still running on the Mac. Reconnect to restore them.',
      );
    });

    _socket!.onDisconnect((reason) {
      if (_webrtc?.isWebRTCConnected ?? false) {
        debugPrint(
          '⚠️  Relay server disconnected, but P2P connection is still active',
        );
        setState(() {
          _connected = false;
        });
        _terminal.write(
          '\r\n\x1b[33m⚠️  Relay server disconnected (P2P still active)\x1b[0m\r\n',
        );
        return;
      }

      setState(() {
        _connected = false;
        _paired = false;
        _processes.clear();
        _activeProcessUuid = null;
      });
      _terminal.write('\r\n\x1b[31m❌ Disconnected: $reason\x1b[0m\r\n');
    });

    _socket!.onConnectError((error) {
      debugPrint('❌ Socket connect error: $error');
      setState(() {
        _connectionStatus =
            '❌ Connection error: $error\nURL: ${widget.relayServerUrl}';
      });
      _showError(
        'Connection Error',
        'Failed to connect to relay server:\n$error\n\nURL: ${widget.relayServerUrl}',
      );
    });

    _socket!.on('error', (data) {
      debugPrint('❌ Socket error event: $data');
      final message = data['message'] as String?;
      _terminal.write('\r\n\x1b[31m❌ Error: $message\x1b[0m\r\n');
      _showError('Error', message ?? 'Unknown error');
    });

    print('🔌 Connecting socket to ${widget.relayServerUrl}...');
    _socket!.connect();
    print('🔌 Socket connect() called');
  }

  void _handleHandshakeInitiate(Map<String, dynamic> data) {
    final peerId = data['peerId'] as String;
    final peerPublicKey = data['peerPublicKey'] as String;
    final challenge = data['challenge'] as String;

    debugPrint('🔐 Starting secure handshake with $peerId...');
    setState(() {
      _connectionStatus = '🔐 Verifying security...';
    });

    try {
      if (_keyPair == null) {
        throw Exception('No key pair available');
      }

      // Derive shared secret
      _sharedSecret = CryptoUtils.deriveSharedSecret(
        _keyPair!.privateKey,
        peerPublicKey,
      );
      debugPrint('✅ Derived shared secret');

      // Sign the challenge
      final signature = CryptoUtils.signChallenge(challenge, _sharedSecret!);

      // Send response
      _socket!.emit('handshake:response', {
        'peerId': peerId,
        'signature': signature,
      });

      debugPrint('📤 Sent challenge response');
    } catch (error) {
      debugPrint('❌ Handshake failed: $error');
      setState(() {
        _connectionStatus = '❌ Security handshake failed';
      });
      _socket!.emit('error', {'message': 'Handshake failed'});
    }
  }

  void _initWebRTC() async {
    if (widget.targetDeviceId != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        Config.connectionStatusKey,
        jsonEncode({'deviceId': widget.targetDeviceId, 'status': 'connecting'}),
      );
    }

    _webrtc = WebRTCService(_socket!);

    // Handle WebRTC messages
    _webrtc!.onMessage((data) {
      final type = data['type'] as String?;
      final payload = data['payload'];
      if (Config.debug) {
        debugPrint(
          '📡 WebRTC message received: type=$type, hasPayload=${payload != null}',
        );
      }
      _handleProcessMessage(type ?? '', payload ?? data);
    });

    // Handle WebRTC connection state
    _webrtc!.onStateChange((state) async {
      final prefs = await SharedPreferences.getInstance();

      if (state == 'connected') {
        setState(() {
          _webrtcConnected = true;
        });

        if (widget.targetDeviceId != null) {
          await prefs.setString(
            Config.connectionStatusKey,
            jsonEncode({
              'deviceId': widget.targetDeviceId,
              'status': 'connected',
            }),
          );
        }
        debugPrint('🎉 WebRTC P2P connected!');

        // Auto-create first process if needed
        if (_paired && !_firstProcessCreated) {
          _firstProcessCreated = true;
          debugPrint(
            '📱 Auto-creating first process after WebRTC connected...',
          );
          Future.delayed(const Duration(milliseconds: 200), () {
            _createProcess();
          });
        }
      } else if (state == 'connecting') {
        if (widget.targetDeviceId != null) {
          await prefs.setString(
            Config.connectionStatusKey,
            jsonEncode({
              'deviceId': widget.targetDeviceId,
              'status': 'connecting',
            }),
          );
        }
      } else if (state == 'disconnected' ||
          state == 'failed' ||
          state == 'closed') {
        setState(() {
          _webrtcConnected = false;
        });
        await prefs.remove(Config.connectionStatusKey);
        debugPrint('⚠️  WebRTC disconnected, using relay server fallback');
      }
    });
  }

  void _handleProcessMessage(String type, dynamic payload) {
    switch (type) {
      case 'processes:sync':
        final syncPayload = ProcessesSyncPayload.fromJson(
          payload as Map<String, dynamic>,
        );
        debugPrint(
          '📋 Received processes:sync with ${syncPayload.processes.length} process(es)',
        );

        setState(() {
          _syncingTabs = false;
        });

        if (syncPayload.processes.isNotEmpty) {
          _firstProcessCreated = true;

          // Restore processes from Mac
          final restoredProcesses = syncPayload.processes
              .map(
                (p) => TerminalProcess(
                  uuid: p.uuid,
                  createdAt: p.createdAt,
                  label: p.name,
                ),
              )
              .toList();

          setState(() {
            _processes.clear();
            _processes.addAll(restoredProcesses);
          });

          // Update process counter
          int maxTabNumber = 0;
          for (final p in restoredProcesses) {
            final match = RegExp(r'^Tab (\d+)$').firstMatch(p.label);
            if (match != null) {
              final num = int.tryParse(match.group(1)!) ?? 0;
              if (num > maxTabNumber) maxTabNumber = num;
            }
          }
          _processCounter = maxTabNumber;

          // Set active process
          if (syncPayload.activeUuids.isNotEmpty) {
            final activeUuid = syncPayload.activeUuids.first;
            setState(() {
              _activeProcessUuid = activeUuid;
            });
            _sendToMac('process:switch', {
              'activeUuids': [activeUuid],
            });
          } else if (restoredProcesses.isNotEmpty) {
            final firstUuid = restoredProcesses.first.uuid;
            setState(() {
              _activeProcessUuid = firstUuid;
            });
            _sendToMac('process:switch', {
              'activeUuids': [firstUuid],
            });
          }

          debugPrint('✅ Restored ${restoredProcesses.length} tab(s) from Mac');
        } else {
          debugPrint('📋 No existing tabs on Mac - user can create a new one');
        }
        break;

      case 'process:created':
        final data = payload as Map<String, dynamic>;
        final uuid = data['uuid'] as String;
        debugPrint('✅ Mac confirmed process created: ${uuid.substring(0, 8)}');
        break;

      case 'process:terminated':
        final data = payload as Map<String, dynamic>;
        final uuid = data['uuid'] as String;
        debugPrint(
          '✅ Mac confirmed process terminated: ${uuid.substring(0, 8)}',
        );
        break;

      case 'process:exited':
        final data = payload as Map<String, dynamic>;
        final uuid = data['uuid'] as String;
        debugPrint('⚠️ Process exited unexpectedly: ${uuid.substring(0, 8)}');

        setState(() {
          _processes.removeWhere((p) => p.uuid == uuid);
          if (_activeProcessUuid == uuid && _processes.isNotEmpty) {
            _activeProcessUuid = _processes.last.uuid;
          } else if (_processes.isEmpty) {
            _activeProcessUuid = null;
          }
        });
        break;

      case 'process:screen':
        final data = payload as Map<String, dynamic>;
        final uuid = data['uuid'] as String;
        final screenData = data['data'] as String;
        debugPrint('📺 Received screen snapshot for ${uuid.substring(0, 8)}');

        if (uuid == _activeProcessUuid) {
          _terminal.write(screenData);
        }
        break;

      case 'process:error':
        final data = payload as Map<String, dynamic>;
        final uuid = data['uuid'] as String;
        final error = data['error'] as String;
        debugPrint('❌ Process error for ${uuid.substring(0, 8)}: $error');
        _showError('Process Error', error);
        break;

      case 'terminal:output':
        if (payload is Map<String, dynamic> && payload['uuid'] != null) {
          final uuid = payload['uuid'] as String;
          final data = payload['data'] as String;

          if (uuid == _activeProcessUuid) {
            _terminal.write(data);
          }
        } else if (payload is String) {
          // Legacy format
          _terminal.write(payload);
        }
        break;
    }
  }

  bool _sendToMac(String type, dynamic payload) {
    if (_webrtc?.isWebRTCConnected ?? false) {
      final success = _webrtc!.sendMessage(type, payload);
      if (!success && _socket != null) {
        _socket!.emit(type, payload);
      }
      return success;
    } else if (_socket != null) {
      _socket!.emit(type, payload);
      return true;
    }
    return false;
  }

  void _sendTerminalInput(String data) {
    if (_paired && _activeProcessUuid != null) {
      final payload = TerminalInputPayload(
        uuid: _activeProcessUuid!,
        data: data,
      );

      if (_webrtc?.isWebRTCConnected ?? false) {
        final success = _webrtc!.sendMessage(
          'terminal:input',
          payload.toJson(),
        );
        if (!success && _socket != null) {
          _socket!.emit('terminal:input', payload.toJson());
        }
      } else if (_socket != null) {
        _socket!.emit('terminal:input', payload.toJson());
      }
    }
  }

  String? _createProcess() {
    if (!_paired) {
      debugPrint('❌ Cannot create process: not paired');
      return null;
    }

    _firstProcessCreated = true;
    setState(() {
      _syncingTabs = false;
    });

    final uuid = _uuid.v4();
    _processCounter++;
    final label = 'Tab $_processCounter';

    debugPrint('📱 Creating process: ${uuid.substring(0, 8)} ($label)');

    final newProcess = TerminalProcess(
      uuid: uuid,
      createdAt: DateTime.now().millisecondsSinceEpoch,
      label: label,
    );

    setState(() {
      _processes.add(newProcess);
      _activeProcessUuid = uuid;
      _loadingProcesses.add(uuid);
    });

    // Send create command to Mac
    _sendToMac(
      'process:create',
      ProcessCreatePayload(uuid: uuid, name: label).toJson(),
    );

    // Clear terminal for new process
    _terminal.buffer.clear();

    // Hide loading spinner after shell initialization
    Future.delayed(const Duration(milliseconds: 800), () {
      setState(() {
        _loadingProcesses.remove(uuid);
      });
    });

    return uuid;
  }

  void _terminateProcess(String uuid) {
    debugPrint('📱 Terminating process: ${uuid.substring(0, 8)}');

    _sendToMac(
      'process:terminate',
      ProcessTerminatePayload(uuid: uuid).toJson(),
    );

    setState(() {
      _processes.removeWhere((p) => p.uuid == uuid);

      if (_activeProcessUuid == uuid && _processes.isNotEmpty) {
        _activeProcessUuid = _processes.last.uuid;
        _sendToMac(
          'process:switch',
          ProcessSwitchPayload(activeUuids: [_activeProcessUuid!]).toJson(),
        );
      } else if (_processes.isEmpty) {
        _activeProcessUuid = null;
      }
    });
  }

  void _switchProcess(String uuid) {
    if (uuid == _activeProcessUuid) return;

    debugPrint('📱 Switching to process: ${uuid.substring(0, 8)}');

    setState(() {
      _activeProcessUuid = uuid;
    });

    _sendToMac(
      'process:switch',
      ProcessSwitchPayload(activeUuids: [uuid]).toJson(),
    );

    // Clear terminal - Mac will send the snapshot
    _terminal.buffer.clear();
  }

  void _handleCopyTerminal() async {
    // Get terminal content
    final buffer = _terminal.buffer;
    final lines = <String>[];
    for (int i = 0; i < buffer.lines.length; i++) {
      lines.add(buffer.lines[i].toString());
    }
    final text = lines.join('\n');

    await Clipboard.setData(ClipboardData(text: text));

    setState(() {
      _copyFeedback = true;
    });

    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted) {
        setState(() {
          _copyFeedback = false;
        });
      }
    });
  }

  void _handleAiPromptSubmit() {
    if (_aiPrompt.trim().isEmpty) {
      _showError('Error', 'Please enter a prompt');
      return;
    }

    if (!_paired) {
      _showError('Error', 'Not connected to Mac client');
      return;
    }

    debugPrint('🤖 Sending AI prompt: $_aiPrompt');
    setState(() {
      _aiProcessing = true;
    });

    _sendToMac('ai:prompt', {
      'prompt': _aiPrompt.trim(),
      'uuid': _activeProcessUuid,
    });

    // Show toast
    final toastMsg =
        '🤖 AI: "${_aiPrompt.trim().substring(0, _aiPrompt.trim().length > 50 ? 50 : _aiPrompt.trim().length)}${_aiPrompt.trim().length > 50 ? "..." : ""}"';
    setState(() {
      _aiToastMessage = toastMsg;
      _aiModalVisible = false;
      _aiPrompt = '';
    });

    _toastTimer?.cancel();
    _toastTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) {
        setState(() {
          _aiToastMessage = null;
        });
      }
    });

    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) {
        setState(() {
          _aiProcessing = false;
        });
      }
    });
  }

  void _showError(String title, String message) {
    if (!mounted) return;
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.bgSecondary,
        title: Text(
          title,
          style: const TextStyle(color: AppColors.textPrimary),
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
    _toastTimer?.cancel();
    _webrtc?.cleanup();
    _socket?.disconnect();
    SharedPreferences.getInstance().then((prefs) {
      prefs.remove(Config.connectionStatusKey);
    });
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasConnectionParams) {
      return _buildNotConnectedState();
    }

    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            _buildTabBar(),
            Expanded(
              child: _processes.isNotEmpty
                  ? _buildTerminal()
                  : !_paired
                  ? _buildConnectingState()
                  : _syncingTabs
                  ? _buildSyncingState()
                  : _buildEmptyState(),
            ),
            if (_aiToastMessage != null) _buildAiToast(),
          ],
        ),
      ),
    );
  }

  Widget _buildNotConnectedState() {
    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(40),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 100,
                  height: 100,
                  decoration: BoxDecoration(
                    color: AppColors.bgTertiary,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.borderSubtle),
                  ),
                  child: const Center(
                    child: Text(
                      '◎',
                      style: TextStyle(
                        fontSize: 48,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'No Active Connection',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 12),
                Text(
                  'Connect to a Mac client to start using the terminal',
                  style: Theme.of(context).textTheme.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),
                ElevatedButton(
                  onPressed: widget.onBack,
                  child: const Text('Go to Connections'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        color: AppColors.bgPrimary,
        border: Border(bottom: BorderSide(color: AppColors.borderSubtle)),
      ),
      child: Row(
        children: [
          // Back button
          _buildIconButton(icon: '←', onTap: widget.onBack),

          // Status
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Status indicator
                Stack(
                  children: [
                    if (_paired && _webrtcConnected)
                      Container(
                        width: 16,
                        height: 16,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.primary.withValues(alpha: 0.4),
                        ),
                      ),
                    Container(
                      width: 6,
                      height: 6,
                      margin: EdgeInsets.all(
                        _paired && _webrtcConnected ? 5 : 0,
                      ),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _paired && _webrtcConnected
                            ? AppColors.primary
                            : AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 8),
                Text(
                  _copyFeedback
                      ? '✓ Copied!'
                      : _paired && _webrtcConnected
                      ? 'Connected'
                      : _paired
                      ? 'Connecting'
                      : _connected
                      ? (_connectionStatus.isEmpty ? 'Relay' : 'Connecting')
                      : 'Offline',
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),

          // Action buttons
          Row(
            children: [
              _buildIconButton(
                icon: 'AI',
                onTap: _paired && !_aiProcessing
                    ? () => setState(() => _aiModalVisible = true)
                    : null,
                isPrimary: true,
                isLoading: _aiProcessing,
              ),
              const SizedBox(width: 8),
              _buildIconButton(
                icon: '⟳',
                onTap: () {
                  // Refresh dimensions
                },
              ),
              const SizedBox(width: 8),
              _buildIconButton(icon: '❐', onTap: _handleCopyTerminal),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildIconButton({
    required String icon,
    VoidCallback? onTap,
    bool isPrimary = false,
    bool isLoading = false,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: isPrimary ? AppColors.primary : AppColors.bgTertiary,
          borderRadius: BorderRadius.circular(18),
          border: isPrimary ? null : Border.all(color: AppColors.borderSubtle),
        ),
        child: Center(
          child: isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      AppColors.primary,
                    ),
                  ),
                )
              : Text(
                  icon,
                  style: TextStyle(
                    color: isPrimary
                        ? AppColors.textPrimary
                        : AppColors.secondary,
                    fontSize: icon.length > 1 ? 12 : 18,
                    fontWeight: icon.length > 1
                        ? FontWeight.w700
                        : FontWeight.normal,
                  ),
                ),
        ),
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      height: 44,
      decoration: const BoxDecoration(
        color: AppColors.bgSecondary,
        border: Border(bottom: BorderSide(color: AppColors.borderSubtle)),
      ),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        children: [
          ..._processes.map((process) => _buildTab(process)),
          // Add tab button
          GestureDetector(
            onTap: _paired ? _createProcess : null,
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.secondary),
              ),
              child: Center(
                child: Opacity(
                  opacity: _paired ? 1.0 : 0.5,
                  child: const Text(
                    '+',
                    style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTab(TerminalProcess process) {
    final isActive = process.uuid == _activeProcessUuid;

    return GestureDetector(
      onTap: () => _switchProcess(process.uuid),
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.only(left: 16, right: 12),
        decoration: BoxDecoration(
          color: isActive ? AppColors.accentSelected : AppColors.bgTertiary,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isActive ? AppColors.primary : AppColors.borderSubtle,
            width: isActive ? 1.5 : 1,
          ),
          boxShadow: isActive
              ? [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.4),
                    blurRadius: 8,
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              process.label,
              style: TextStyle(
                color: isActive ? AppColors.secondary : AppColors.textSecondary,
                fontSize: 13,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () => _terminateProcess(process.uuid),
              child: Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: const Center(
                  child: Text(
                    '×',
                    style: TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 16,
                      fontWeight: FontWeight.w300,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTerminal() {
    return Stack(
      children: [
        TerminalView(
          _terminal,
          controller: _terminalController,
          theme: TerminalTheme(
            cursor: _currentTheme.cursor,
            selection: _currentTheme.cursor.withValues(alpha: 0.3),
            foreground: _currentTheme.foreground,
            background: _currentTheme.background,
            black: Colors.black,
            red: const Color(0xFFCD3131),
            green: const Color(0xFF0DBC79),
            yellow: const Color(0xFFE5E510),
            blue: const Color(0xFF2472C8),
            magenta: const Color(0xFFBC3FBC),
            cyan: const Color(0xFF11A8CD),
            white: const Color(0xFFE5E5E5),
            brightBlack: const Color(0xFF666666),
            brightRed: const Color(0xFFF14C4C),
            brightGreen: const Color(0xFF23D18B),
            brightYellow: const Color(0xFFF5F543),
            brightBlue: const Color(0xFF3B8EEA),
            brightMagenta: const Color(0xFFD670D6),
            brightCyan: const Color(0xFF29B8DB),
            brightWhite: Colors.white,
            searchHitBackground: const Color(0xFFFFFF00),
            searchHitBackgroundCurrent: const Color(0xFFFF9632),
            searchHitForeground: Colors.black,
          ),
          textStyle: const TerminalStyle(fontSize: 14, fontFamily: 'monospace'),
          autofocus: true,
        ),

        // Loading overlay
        if (_activeProcessUuid != null &&
            _loadingProcesses.contains(_activeProcessUuid))
          Container(
            color: AppColors.bgPrimary,
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 250,
                    height: 250,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.primary.withValues(alpha: 0.3),
                    ),
                  ),
                  Transform.translate(
                    offset: const Offset(0, -125),
                    child: Column(
                      children: [
                        const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              AppColors.primary,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Starting terminal...',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

        // AI Modal
        if (_aiModalVisible) _buildAiModal(),
      ],
    );
  }

  Widget _buildConnectingState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 250,
            height: 250,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.primary.withValues(alpha: 0.3),
            ),
          ),
          Transform.translate(
            offset: const Offset(0, -125),
            child: Column(
              children: [
                const CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
                ),
                const SizedBox(height: 20),
                Text(
                  'Connecting to Mac...',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  'Establishing secure connection',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSyncingState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 250,
            height: 250,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.primary.withValues(alpha: 0.3),
            ),
          ),
          Transform.translate(
            offset: const Offset(0, -125),
            child: Column(
              children: [
                const CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
                ),
                const SizedBox(height: 20),
                Text(
                  'Syncing Tabs...',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  'Loading your terminals from Mac',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                color: AppColors.bgTertiary,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.borderSubtle),
              ),
              child: const Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '\$',
                      style: TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.w700,
                        color: AppColors.secondary,
                        fontFamily: 'monospace',
                      ),
                    ),
                    SizedBox(width: 10),
                    Text(
                      'ls',
                      style: TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.w700,
                        color: AppColors.secondary,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'No Terminal Open',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            Text(
              'Tap the + button above to open a new terminal tab',
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _paired ? _createProcess : null,
              child: const Text('+ New Terminal'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAiToast() {
    return Container(
      margin: const EdgeInsets.all(20),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xF2009999),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Text(
        _aiToastMessage ?? '',
        style: const TextStyle(
          color: Colors.black,
          fontSize: 14,
          fontWeight: FontWeight.w600,
          fontFamily: 'monospace',
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  Widget _buildAiModal() {
    return GestureDetector(
      onTap: () => setState(() => _aiModalVisible = false),
      child: Container(
        color: AppColors.bgPrimary.withValues(alpha: 0.95),
        child: Center(
          child: GestureDetector(
            onTap: () {}, // Prevent tap from closing modal
            child: Container(
              margin: const EdgeInsets.all(20),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.bgSecondary,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.primary, width: 1.5),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.4),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Icon
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primary.withValues(alpha: 0.5),
                          blurRadius: 8,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: const Center(
                      child: Text('✨', style: TextStyle(fontSize: 32)),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Title
                  Text(
                    'AI Assistant',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Describe what you want to do in the terminal',
                    style: Theme.of(context).textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),

                  // Input
                  TextField(
                    autofocus: true,
                    maxLines: 4,
                    onChanged: (value) => _aiPrompt = value,
                    style: const TextStyle(color: AppColors.textPrimary),
                    decoration: InputDecoration(
                      hintText: "e.g., 'Open vim and write hello world'",
                      hintStyle: const TextStyle(color: AppColors.textMuted),
                      filled: true,
                      fillColor: AppColors.bgTertiary,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppColors.borderSubtle,
                        ),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppColors.borderSubtle,
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppColors.primary,
                          width: 1.5,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Buttons
                  Row(
                    children: [
                      Expanded(
                        child: TextButton(
                          onPressed: () {
                            setState(() {
                              _aiModalVisible = false;
                              _aiPrompt = '';
                            });
                          },
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                              side: const BorderSide(
                                color: AppColors.borderSubtle,
                              ),
                            ),
                          ),
                          child: const Text(
                            'Cancel',
                            style: TextStyle(color: AppColors.textSecondary),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _aiPrompt.trim().isNotEmpty
                              ? _handleAiPromptSubmit
                              : null,
                          child: const Text('Send'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
