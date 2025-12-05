import React, { createContext, useContext, useState, ReactNode } from 'react';
import { WebRTCService } from './WebRTCService';
import { Socket } from 'socket.io-client';

export interface ConnectionInfo {
  relayServerUrl: string;
  deviceId: string;
  deviceName: string;
}

export interface ConnectionState {
  isConnected: boolean;
  isPaired: boolean;
  isWebRTCConnected: boolean;
  connectionInfo: ConnectionInfo | null;
  webrtcService: WebRTCService | null;
  socket: Socket | null;
}

interface ConnectionContextType {
  state: ConnectionState;
  setConnected: (connected: boolean) => void;
  setPaired: (paired: boolean) => void;
  setWebRTCConnected: (connected: boolean) => void;
  setConnectionInfo: (info: ConnectionInfo | null) => void;
  setWebRTCService: (service: WebRTCService | null) => void;
  setSocket: (socket: Socket | null) => void;
  reset: () => void;
}

const initialState: ConnectionState = {
  isConnected: false,
  isPaired: false,
  isWebRTCConnected: false,
  connectionInfo: null,
  webrtcService: null,
  socket: null,
};

const ConnectionContext = createContext<ConnectionContextType | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [state, setState] = useState<ConnectionState>(initialState);

  const setConnected = (connected: boolean) => {
    setState((prev) => ({ ...prev, isConnected: connected }));
  };

  const setPaired = (paired: boolean) => {
    setState((prev) => ({ ...prev, isPaired: paired }));
  };

  const setWebRTCConnected = (connected: boolean) => {
    setState((prev) => ({ ...prev, isWebRTCConnected: connected }));
  };

  const setConnectionInfo = (info: ConnectionInfo | null) => {
    setState((prev) => ({ ...prev, connectionInfo: info }));
  };

  const setWebRTCService = (service: WebRTCService | null) => {
    setState((prev) => ({ ...prev, webrtcService: service }));
  };

  const setSocket = (socket: Socket | null) => {
    setState((prev) => ({ ...prev, socket: socket }));
  };

  const reset = () => {
    setState(initialState);
  };

  return (
    <ConnectionContext.Provider
      value={{
        state,
        setConnected,
        setPaired,
        setWebRTCConnected,
        setConnectionInfo,
        setWebRTCService,
        setSocket,
        reset,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextType {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
}

// Helper hook to check if we have an active connection
export function useIsConnected(): boolean {
  const { state } = useConnection();
  return state.isPaired && (state.isWebRTCConnected || state.isConnected);
}

