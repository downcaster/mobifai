import {Socket} from 'socket.io-client';
import {RTCPeerConnection, RTCIceCandidate, RTCSessionDescription} from 'react-native-webrtc';

// Import types from the library
import type RTCDataChannel from 'react-native-webrtc/lib/typescript/RTCDataChannel';
import type RTCDataChannelEvent from 'react-native-webrtc/lib/typescript/RTCDataChannelEvent';
import type RTCIceCandidateEvent from 'react-native-webrtc/lib/typescript/RTCIceCandidateEvent';

export type WebRTCMessageHandler = (data: unknown) => void;

export type WebRTCNamespace = 'terminal' | 'code';

interface WebRTCMessage {
  namespace: string;
  action: string;
  payload: unknown;
  type?: string;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private socket: Socket;
  private isConnected: boolean = false;
  private messageHandler: WebRTCMessageHandler | null = null;
  private onConnectionStateChange: ((state: string) => void) | null = null;

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupSignalingHandlers();
  }

  private setupSignalingHandlers() {
    // Handle WebRTC offer from Mac
    this.socket.on('webrtc:offer', async ({offer}) => {
      console.log('📡 Received WebRTC offer from Mac');
      await this.handleOffer(offer);
    });

    // Handle ICE candidates from Mac
    this.socket.on('webrtc:ice-candidate', async ({candidate}) => {
      console.log('🧊 Received ICE candidate from Mac');
      await this.handleIceCandidate(candidate);
    });
  }

  private async handleOffer(offer: {sdp: string; type: string}) {
    try {
      // Create peer connection if it doesn't exist
      if (!this.peerConnection) {
        await this.createPeerConnection();
      }

      // Set remote description (the offer from Mac)
      await this.peerConnection!.setRemoteDescription(
        new RTCSessionDescription({
          sdp: offer.sdp,
          type: offer.type as 'offer' | 'answer' | 'pranswer' | 'rollback',
        }),
      );

      console.log('✅ Remote description set');

      // Create answer
      const answer = await this.peerConnection!.createAnswer();

      // Set local description once
      await this.peerConnection!.setLocalDescription(answer);

      // Wait for ICE gathering to complete before sending answer (with timeout)
      await Promise.race([
        new Promise<void>(resolve => {
          if (this.peerConnection!.iceGatheringState === 'complete') {
            resolve();
          } else {
            const checkGathering = () => {
              console.log(`ICE Gathering State: ${this.peerConnection!.iceGatheringState}`);
              if (this.peerConnection!.iceGatheringState === 'complete') {
                resolve();
              }
            };
            this.peerConnection!.addEventListener('icegatheringstatechange', checkGathering, {
              once: false,
            });
            // Also check immediately in case it completed while we were setting up
            checkGathering();
          }
        }),
        new Promise<void>(resolve =>
          setTimeout(() => {
            console.log('⏱️  ICE gathering timeout - proceeding with available candidates');
            resolve();
          }, 3000),
        ),
      ]);

      console.log('📡 Sending WebRTC answer to Mac (with all ICE candidates)');

      // Send answer to Mac via signaling server (localDescription already set above)
      this.socket.emit('webrtc:answer', {
        answer: {
          sdp: this.peerConnection!.localDescription!.sdp,
          type: this.peerConnection!.localDescription!.type,
        },
      });
    } catch (error) {
      console.error('❌ Failed to handle offer:', error);
    }
  }

  private async handleIceCandidate(candidate: {
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
  }) {
    try {
      if (this.peerConnection && candidate.candidate) {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate({
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
          }),
        );
        console.log('✅ ICE candidate added');
      }
    } catch (error) {
      console.error('❌ Failed to add ICE candidate:', error);
    }
  }

  private async createPeerConnection() {
    console.log('🔗 Creating WebRTC peer connection...');

    // Configure for local connections (no STUN needed for same network)
    const configuration = {
      iceServers: [{urls: 'stun:stun.l.google.com:19302'}], // Add STUN server to help discovery
      iceTransportPolicy: 'all' as 'all', // Allow both relay and host candidates
      iceCandidatePoolSize: 10,
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Handle ICE candidates
    this.peerConnection.addEventListener(
      'icecandidate',
      (event: RTCIceCandidateEvent<'icecandidate'>) => {
        if (event.candidate) {
          console.log('🧊 Generated ICE candidate, sending to Mac');
          const candidateStr = event.candidate.candidate || '';
          const candidateType = candidateStr.split(' ')[7] || 'unknown';
          console.log(`   Type: ${candidateType}, Candidate: ${candidateStr.substring(0, 50)}...`);
          this.socket.emit('webrtc:ice-candidate', {
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            },
          });
        }
      },
    );

    // Handle connection state changes
    this.peerConnection.addEventListener('connectionstatechange', () => {
      const state = this.peerConnection?.connectionState || 'unknown';
      console.log(`WebRTC Connection State: ${state}`);

      if (state === 'connected') {
        this.isConnected = true;
        console.log('🎉 WebRTC P2P connection established!');
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.isConnected = false;
        console.log('❌ WebRTC connection lost');
      }

      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state);
      }
    });

    // Handle ICE connection state changes (more detailed)
    this.peerConnection.addEventListener('iceconnectionstatechange', () => {
      const iceState = this.peerConnection?.iceConnectionState || 'unknown';
      console.log(`ICE Connection State: ${iceState}`);

      if (iceState === 'failed') {
        console.log('❌ ICE connection failed - check network settings');
      }
    });

    this.peerConnection.addEventListener('icegatheringstatechange', () => {
      const gatheringState = this.peerConnection?.iceGatheringState || 'unknown';
      console.log(`ICE Gathering State: ${gatheringState}`);
    });

    // Handle data channel from Mac (Mac creates the channel)
    this.peerConnection.addEventListener(
      'datachannel',
      (event: RTCDataChannelEvent<'datachannel'>) => {
        console.log('📬 Received data channel from Mac');
        this.dataChannel = event.channel;
        this.setupDataChannel();
      },
    );

    console.log('✅ Peer connection created');
  }

  private setupDataChannel() {
    if (!this.dataChannel) {
      return;
    }

    this.dataChannel.addEventListener('open', () => {
      console.log('✅ WebRTC data channel opened');
      this.isConnected = true;
    });

    this.dataChannel.addEventListener('close', () => {
      console.log('⚠️  WebRTC data channel closed');
      this.isConnected = false;
    });

    this.dataChannel.addEventListener('error', (error: Event) => {
      console.error('❌ WebRTC data channel error:', error);
      this.isConnected = false;
    });

    this.dataChannel.addEventListener('message', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        // Log all incoming messages for debugging
        console.log(`📨 WebRTC raw message: type=${data.type}`);
        if (this.messageHandler) {
          this.messageHandler(data);
        } else {
          console.warn('⚠️ WebRTC message received but no handler set!');
        }
      } catch (error) {
        console.error(
          '❌ Error parsing WebRTC message:',
          error,
          'Raw:',
          event.data?.substring?.(0, 100),
        );
      }
    });
  }

  /**
   * Send message via WebRTC data channel
   * Supports both namespace format (3 args) and legacy format (2 args)
   */
  public sendMessage(
    namespaceOrType: WebRTCNamespace | string,
    actionOrPayload: string | unknown,
    payload?: unknown,
  ): boolean {
    if (this.isConnected && this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        let message: WebRTCMessage;

        // Check if using new namespace format (3 arguments)
        if (payload !== undefined && typeof actionOrPayload === 'string') {
          // New format: namespace, action, payload
          message = {
            namespace: namespaceOrType,
            action: actionOrPayload,
            payload: payload,
          };
        } else {
          // Legacy format: type, payload
          // Convert to new format with 'terminal' namespace for backward compatibility
          message = {
            namespace: 'terminal',
            action: namespaceOrType,
            payload: actionOrPayload,
            // Keep old format for backward compatibility
            type: namespaceOrType,
          };
        }

        this.dataChannel.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('❌ Failed to send via WebRTC:', error);
        return false;
      }
    }
    return false;
  }

  public onMessage(handler: WebRTCMessageHandler) {
    this.messageHandler = handler;
  }

  public onStateChange(handler: (state: string) => void) {
    this.onConnectionStateChange = handler;
  }

  public isWebRTCConnected(): boolean {
    return this.isConnected;
  }

  public cleanup() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.isConnected = false;
  }
}
