import { io, Socket } from 'socket.io-client';

type EventHandler = (data: any) => void;

export class SocketService {
  private socket: Socket | null = null;
  private serverUrl: string;
  private token: string;
  private eventHandlers: Map<string, EventHandler[]> = new Map();

  constructor(serverUrl: string, token: string) {
    this.serverUrl = serverUrl;
    this.token = token;
  }

  connect(): void {
    if (this.socket?.connected) {
      console.log('Already connected');
      return;
    }

    this.socket = io(this.serverUrl, {
      auth: {
        token: this.token,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    // Setup event listeners
    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('connected', (data) => {
      this.emit('connected', data);
    });

    this.socket.on('output', (data) => {
      this.emit('output', data);
    });

    this.socket.on('error', (error) => {
      this.emit('error', error);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.emit('disconnect', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.emit('error', { message: 'Failed to connect to server' });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendInput(data: string): void {
    if (this.socket?.connected) {
      this.socket.emit('input', data);
    }
  }

  resize(cols: number, rows: number): void {
    if (this.socket?.connected) {
      this.socket.emit('resize', { cols, rows });
    }
  }

  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}
