import 'dart:convert';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

/// Callback for WebRTC messages received via data channel
typedef WebRTCMessageHandler = void Function(Map<String, dynamic> data);

/// Callback for connection state changes
typedef ConnectionStateHandler = void Function(String state);

/// WebRTC P2P connection service
class WebRTCService {
  RTCPeerConnection? _peerConnection;
  RTCDataChannel? _dataChannel;
  final io.Socket _socket;
  bool _isConnected = false;
  WebRTCMessageHandler? _messageHandler;
  ConnectionStateHandler? _onConnectionStateChange;

  WebRTCService(this._socket) {
    _setupSignalingHandlers();
  }

  /// Setup signaling event handlers
  void _setupSignalingHandlers() {
    // Handle WebRTC offer from Mac
    _socket.on('webrtc:offer', (data) async {
      print('📡 Received WebRTC offer from Mac');
      final offer = data['offer'] as Map<String, dynamic>;
      await _handleOffer(offer);
    });

    // Handle ICE candidates from Mac
    _socket.on('webrtc:ice-candidate', (data) async {
      print('🧊 Received ICE candidate from Mac');
      final candidate = data['candidate'] as Map<String, dynamic>;
      await _handleIceCandidate(candidate);
    });
  }

  /// Handle incoming WebRTC offer
  Future<void> _handleOffer(Map<String, dynamic> offer) async {
    try {
      // Create peer connection if it doesn't exist
      if (_peerConnection == null) {
        await _createPeerConnection();
      }

      // Set remote description (the offer from Mac)
      final description = RTCSessionDescription(
        offer['sdp'] as String,
        offer['type'] as String,
      );
      await _peerConnection!.setRemoteDescription(description);
      print('✅ Remote description set');

      // Create answer
      final answer = await _peerConnection!.createAnswer();

      // Set local description once
      await _peerConnection!.setLocalDescription(answer);

      // Wait for ICE gathering to complete (with timeout)
      await _waitForIceGathering();

      print('📡 Sending WebRTC answer to Mac (with all ICE candidates)');

      // Send answer to Mac via signaling server
      final localDescription = await _peerConnection!.getLocalDescription();
      _socket.emit('webrtc:answer', {
        'answer': {
          'sdp': localDescription?.sdp,
          'type': localDescription?.type,
        },
      });
    } catch (error) {
      print('❌ Failed to handle offer: $error');
    }
  }

  /// Wait for ICE gathering to complete with timeout
  Future<void> _waitForIceGathering() async {
    if (_peerConnection?.iceGatheringState ==
        RTCIceGatheringState.RTCIceGatheringStateComplete) {
      return;
    }

    await Future.any([
      Future(() async {
        while (_peerConnection?.iceGatheringState !=
            RTCIceGatheringState.RTCIceGatheringStateComplete) {
          await Future.delayed(const Duration(milliseconds: 100));
          print(
              'ICE Gathering State: ${_peerConnection?.iceGatheringState}');
        }
      }),
      Future.delayed(const Duration(seconds: 3), () {
        print('⏱️  ICE gathering timeout - proceeding with available candidates');
      }),
    ]);
  }

  /// Handle incoming ICE candidate
  Future<void> _handleIceCandidate(Map<String, dynamic> candidate) async {
    try {
      if (_peerConnection != null && candidate['candidate'] != null) {
        final iceCandidate = RTCIceCandidate(
          candidate['candidate'] as String,
          candidate['sdpMid'] as String?,
          candidate['sdpMLineIndex'] as int?,
        );
        await _peerConnection!.addCandidate(iceCandidate);
        print('✅ ICE candidate added');
      }
    } catch (error) {
      print('❌ Failed to add ICE candidate: $error');
    }
  }

  /// Create the peer connection
  Future<void> _createPeerConnection() async {
    print('🔗 Creating WebRTC peer connection...');

    // Configuration with STUN server
    final configuration = {
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
      ],
      'iceTransportPolicy': 'all',
      'iceCandidatePoolSize': 10,
    };

    _peerConnection = await createPeerConnection(configuration);

    // Handle ICE candidates
    _peerConnection!.onIceCandidate = (RTCIceCandidate candidate) {
      print('🧊 Generated ICE candidate, sending to Mac');
      final candidateStr = candidate.candidate ?? '';
      final parts = candidateStr.split(' ');
      final candidateType = parts.length > 7 ? parts[7] : 'unknown';
      print('   Type: $candidateType, Candidate: ${candidateStr.substring(0, candidateStr.length > 50 ? 50 : candidateStr.length)}...');

      _socket.emit('webrtc:ice-candidate', {
        'candidate': {
          'candidate': candidate.candidate,
          'sdpMid': candidate.sdpMid,
          'sdpMLineIndex': candidate.sdpMLineIndex,
        },
      });
    };

    // Handle connection state changes
    _peerConnection!.onConnectionState = (RTCPeerConnectionState state) {
      final stateStr = _connectionStateToString(state);
      print('WebRTC Connection State: $stateStr');

      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _isConnected = true;
        print('🎉 WebRTC P2P connection established!');
      } else if (state ==
              RTCPeerConnectionState.RTCPeerConnectionStateDisconnected ||
          state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
          state == RTCPeerConnectionState.RTCPeerConnectionStateClosed) {
        _isConnected = false;
        print('❌ WebRTC connection lost');
      }

      _onConnectionStateChange?.call(stateStr);
    };

    // Handle ICE connection state changes
    _peerConnection!.onIceConnectionState = (RTCIceConnectionState state) {
      print('ICE Connection State: $state');
      if (state == RTCIceConnectionState.RTCIceConnectionStateFailed) {
        print('❌ ICE connection failed - check network settings');
      }
    };

    // Handle ICE gathering state changes
    _peerConnection!.onIceGatheringState = (RTCIceGatheringState state) {
      print('ICE Gathering State: $state');
    };

    // Handle data channel from Mac (Mac creates the channel)
    _peerConnection!.onDataChannel = (RTCDataChannel channel) {
      print('📬 Received data channel from Mac');
      _dataChannel = channel;
      _setupDataChannel();
    };

    print('✅ Peer connection created');
  }

  /// Convert connection state to string
  String _connectionStateToString(RTCPeerConnectionState state) {
    switch (state) {
      case RTCPeerConnectionState.RTCPeerConnectionStateNew:
        return 'new';
      case RTCPeerConnectionState.RTCPeerConnectionStateConnecting:
        return 'connecting';
      case RTCPeerConnectionState.RTCPeerConnectionStateConnected:
        return 'connected';
      case RTCPeerConnectionState.RTCPeerConnectionStateDisconnected:
        return 'disconnected';
      case RTCPeerConnectionState.RTCPeerConnectionStateFailed:
        return 'failed';
      case RTCPeerConnectionState.RTCPeerConnectionStateClosed:
        return 'closed';
    }
  }

  /// Setup data channel event handlers
  void _setupDataChannel() {
    if (_dataChannel == null) return;

    _dataChannel!.onDataChannelState = (RTCDataChannelState state) {
      switch (state) {
        case RTCDataChannelState.RTCDataChannelOpen:
          print('✅ WebRTC data channel opened');
          _isConnected = true;
          break;
        case RTCDataChannelState.RTCDataChannelClosed:
          print('⚠️  WebRTC data channel closed');
          _isConnected = false;
          break;
        default:
          break;
      }
    };

    _dataChannel!.onMessage = (RTCDataChannelMessage message) {
      try {
        final data = jsonDecode(message.text) as Map<String, dynamic>;
        _messageHandler?.call(data);
      } catch (error) {
        print('❌ Error parsing WebRTC message: $error');
      }
    };
  }

  /// Send a message via the data channel
  bool sendMessage(String type, dynamic payload) {
    if (_isConnected &&
        _dataChannel != null &&
        _dataChannel!.state == RTCDataChannelState.RTCDataChannelOpen) {
      try {
        final message = jsonEncode({'type': type, 'payload': payload});
        _dataChannel!.send(RTCDataChannelMessage(message));
        return true;
      } catch (error) {
        print('❌ Failed to send via WebRTC: $error');
        return false;
      }
    }
    return false;
  }

  /// Set message handler
  void onMessage(WebRTCMessageHandler handler) {
    _messageHandler = handler;
  }

  /// Set connection state change handler
  void onStateChange(ConnectionStateHandler handler) {
    _onConnectionStateChange = handler;
  }

  /// Check if WebRTC is connected
  bool get isWebRTCConnected => _isConnected;

  /// Cleanup resources
  void cleanup() {
    _dataChannel?.close();
    _dataChannel = null;

    _peerConnection?.close();
    _peerConnection = null;

    _isConnected = false;
  }
}

