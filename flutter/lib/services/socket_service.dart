import 'package:socket_io_client/socket_io_client.dart' as io;

/// Callback type for event handlers
typedef EventHandler = void Function(dynamic data);

/// Socket.IO service for relay server communication
class SocketService {
  io.Socket? _socket;
  final String serverUrl;
  final String? token;
  final Map<String, List<EventHandler>> _eventHandlers = {};

  SocketService({
    required this.serverUrl,
    this.token,
  });

  /// Get the underlying socket instance
  io.Socket? get socket => _socket;

  /// Check if connected
  bool get isConnected => _socket?.connected ?? false;

  /// Connect to the relay server
  void connect() {
    if (_socket?.connected == true) {
      print('SocketService: Already connected');
      return;
    }

    _socket = io.io(
      serverUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .setReconnectionAttempts(5)
          .setAuth({'token': token})
          .build(),
    );

    // Setup core event listeners
    _socket!.onConnect((_) {
      print('SocketService: Connected to $serverUrl');
      _emit('connect', null);
    });

    _socket!.on('connected', (data) {
      _emit('connected', data);
    });

    _socket!.on('output', (data) {
      _emit('output', data);
    });

    _socket!.on('error', (error) {
      _emit('error', error);
    });

    _socket!.onDisconnect((reason) {
      print('SocketService: Disconnected: $reason');
      _emit('disconnect', {'reason': reason});
    });

    _socket!.onConnectError((error) {
      print('SocketService: Connection error: $error');
      _emit('error', {'message': 'Failed to connect to server'});
    });

    _socket!.connect();
  }

  /// Disconnect from the relay server
  void disconnect() {
    _socket?.disconnect();
    _socket = null;
  }

  /// Send terminal input
  void sendInput(String data) {
    if (_socket?.connected == true) {
      _socket!.emit('input', data);
    }
  }

  /// Send resize event
  void resize(int cols, int rows) {
    if (_socket?.connected == true) {
      _socket!.emit('resize', {'cols': cols, 'rows': rows});
    }
  }

  /// Emit an event to the server
  void emitEvent(String event, [dynamic data]) {
    if (_socket?.connected == true) {
      _socket!.emit(event, data);
    }
  }

  /// Register an event handler
  void on(String event, EventHandler handler) {
    _eventHandlers[event] ??= [];
    _eventHandlers[event]!.add(handler);

    // Also register with socket if it exists
    if (_socket != null) {
      _socket!.on(event, (data) {
        _emit(event, data);
      });
    }
  }

  /// Remove an event handler
  void off(String event, [EventHandler? handler]) {
    if (handler != null) {
      _eventHandlers[event]?.remove(handler);
    } else {
      _eventHandlers.remove(event);
    }
  }

  /// Internal emit to local handlers
  void _emit(String event, dynamic data) {
    final handlers = _eventHandlers[event];
    if (handlers != null) {
      for (final handler in handlers) {
        handler(data);
      }
    }
  }

  /// Setup all socket event listeners (call after creating socket)
  void setupEventListeners() {
    if (_socket == null) return;

    // Forward all registered events to the socket
    for (final event in _eventHandlers.keys) {
      _socket!.on(event, (data) {
        _emit(event, data);
      });
    }
  }

  /// Dispose the service
  void dispose() {
    disconnect();
    _eventHandlers.clear();
  }
}

