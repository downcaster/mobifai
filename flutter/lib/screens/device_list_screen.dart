import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config.dart';
import '../theme/colors.dart';
import '../models/process.dart';
import '../utils/crypto.dart';
import '../widgets/app_card.dart';

class DeviceListScreen extends StatefulWidget {
  final void Function(String deviceId) onDeviceSelected;
  final VoidCallback onLogout;

  const DeviceListScreen({
    super.key,
    required this.onDeviceSelected,
    required this.onLogout,
  });

  @override
  State<DeviceListScreen> createState() => _DeviceListScreenState();
}

class _DeviceListScreenState extends State<DeviceListScreen> {
  List<AvailableDevice> _devices = [];
  io.Socket? _socket;
  bool _refreshing = false;
  bool _isLoading = true;
  ConnectionStatus? _connectionStatus;
  KeyPair? _keyPair;

  @override
  void initState() {
    super.initState();
    _initSocket();
    _loadConnectionStatus();
  }

  Future<void> _loadConnectionStatus() async {
    final prefs = await SharedPreferences.getInstance();
    final statusStr = prefs.getString(Config.connectionStatusKey);
    if (statusStr != null) {
      try {
        setState(() {
          _connectionStatus =
              ConnectionStatus.fromJson(jsonDecode(statusStr) as Map<String, dynamic>);
        });
      } catch (_) {
        setState(() {
          _connectionStatus = null;
        });
      }
    }
  }

  Future<void> _initSocket() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(Config.tokenKey);
      final deviceId = prefs.getString(Config.deviceIdKey);

      if (token == null || deviceId == null) {
        _showError('Authentication missing');
        widget.onLogout();
        return;
      }

      _keyPair = CryptoUtils.generateKeyPair();

      _socket = io.io(
        Config.relayServerUrl,
        io.OptionBuilder()
            .setTransports(['websocket'])
            .setAuth({'token': token})
            .setQuery({'deviceId': deviceId, 'type': 'mobile'})
            .enableForceNew()
            .disableAutoConnect()  // Important: set up handlers before connecting
            .build(),
      );

      _socket!.onConnect((_) {
        debugPrint('🔌 DeviceList socket connected');
        debugPrint('📤 Emitting register event...');
        _socket!.emit('register', {
          'type': 'mobile',
          'token': token,
          'deviceId': deviceId,
          'publicKey': _keyPair?.publicKey,
        });
      });

      _socket!.on('error', (err) {
        final message = err is Map ? err['message'] : err.toString();
        _showError(message ?? 'Unknown error');
      });

      _socket!.on('auth_error', (err) async {
        _showError('Session Expired. Please sign in again.');
        await prefs.remove(Config.tokenKey);
        widget.onLogout();
      });

      _socket!.on('available_devices', (data) {
        final List<dynamic> deviceList = data as List<dynamic>;
        setState(() {
          _devices = deviceList
              .map((d) => AvailableDevice.fromJson(d as Map<String, dynamic>))
              .toList();
          _isLoading = false;
          _refreshing = false;
        });
      });

      _socket!.connect();
    } catch (e) {
      debugPrint('DeviceList: Init error $e');
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _handleRefresh() async {
    if (_socket != null && _keyPair != null) {
      setState(() {
        _refreshing = true;
      });

      final prefs = await SharedPreferences.getInstance();
      final deviceId = prefs.getString(Config.deviceIdKey);
      final token = prefs.getString(Config.tokenKey);

      _socket!.emit('register', {
        'type': 'mobile',
        'token': token,
        'deviceId': deviceId,
        'publicKey': _keyPair?.publicKey,
      });
    }
  }

  void _handleDevicePress(AvailableDevice device) async {
    // Don't reconnect if already connected to this device
    if (_connectionStatus?.deviceId == device.deviceId &&
        _connectionStatus?.status == 'connected') {
      widget.onDeviceSelected(device.deviceId);
      return;
    }

    _socket?.disconnect();
    widget.onDeviceSelected(device.deviceId);
  }

  String _getDeviceState(String deviceId) {
    if (_connectionStatus == null || _connectionStatus!.deviceId != deviceId) {
      return 'idle';
    }
    return _connectionStatus!.status;
  }

  void _showError(String message) {
    if (!mounted) return;
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
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Connections',
                        style: Theme.of(context).textTheme.headlineLarge,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Available Mac terminals',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                  _buildRefreshButton(),
                ],
              ),
            ),

            // Content
            Expanded(
              child: _isLoading
                  ? _buildLoadingState()
                  : _devices.isEmpty
                      ? _buildEmptyState()
                      : _buildDeviceList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRefreshButton() {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: AppColors.bgTertiary,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppColors.borderSubtle),
      ),
      child: IconButton(
        onPressed: _refreshing ? null : _handleRefresh,
        icon: _refreshing
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(AppColors.secondary),
                ),
              )
            : const Text(
                '↻',
                style: TextStyle(
                  fontSize: 20,
                  color: AppColors.secondary,
                ),
              ),
      ),
    );
  }

  Widget _buildLoadingState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 250,
            height: 250,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.accentGlow.withValues(alpha: 0.5),
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
                  'Scanning network...',
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
        padding: const EdgeInsets.symmetric(horizontal: 40),
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
              'No Devices Found',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            Text(
              'Make sure your Mac client is running\nand connected to the network',
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _handleRefresh,
              child: const Text('Scan Again'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDeviceList() {
    return RefreshIndicator(
      onRefresh: _handleRefresh,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: _devices.length,
        itemBuilder: (context, index) => _buildDeviceCard(_devices[index]),
      ),
    );
  }

  Widget _buildDeviceCard(AvailableDevice device) {
    final deviceState = _getDeviceState(device.deviceId);
    final isConnected = deviceState == 'connected';
    final isConnecting = deviceState == 'connecting';
    final tabCount = device.tabCount ?? 0;

    return AppCard(
      onTap: () => _handleDevicePress(device),
      selected: isConnected,
      connecting: isConnecting,
      child: Row(
        children: [
          // Device icon with status
          Stack(
            children: [
              // Glow effect
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isConnected
                      ? AppColors.accentGlow
                      : isConnecting
                          ? const Color(0x4DFFAA00)
                          : AppColors.accentGlow.withValues(alpha: 0.5),
                ),
              ),
              // Icon container
              Positioned(
                top: 2,
                left: 2,
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppColors.bgTertiary,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isConnected
                          ? AppColors.primary
                          : isConnecting
                              ? AppColors.borderConnecting
                              : AppColors.borderSubtle,
                    ),
                  ),
                  child: const Center(
                    child: Text(
                      '◉',
                      style: TextStyle(
                        fontSize: 20,
                        color: AppColors.secondary,
                      ),
                    ),
                  ),
                ),
              ),
              // Status dot
              Positioned(
                bottom: 2,
                right: 2,
                child: Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    color: isConnected
                        ? AppColors.success
                        : isConnecting
                            ? AppColors.warning
                            : AppColors.textMuted,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isConnected
                          ? AppColors.accentSelected
                          : isConnecting
                              ? AppColors.connectingGlow
                              : AppColors.bgCard,
                      width: 3,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 16),

          // Device info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  device.deviceName,
                  style: Theme.of(context).textTheme.titleMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  tabCount == 0
                      ? 'No active tabs'
                      : '$tabCount active tab${tabCount != 1 ? 's' : ''}',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),

          // Status badge
          if (isConnecting)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0x33FFAA00),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.borderConnecting),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(AppColors.warning),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'Connecting',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.warning,
                    ),
                  ),
                ],
              ),
            )
          else if (isConnected)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                'Connected',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

