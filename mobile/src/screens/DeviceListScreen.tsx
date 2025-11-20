import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { io, Socket } from 'socket.io-client';
import { RELAY_SERVER_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

type DeviceListScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DeviceList'>;
  route: any; // We can type this properly if we want
};

type AvailableDevice = {
  deviceId: string;
  deviceName: string;
  status: string;
};

const TOKEN_KEY = 'mobifai_auth_token';
const DEVICE_ID_KEY = 'mobifai_device_id';

export default function DeviceListScreen({ navigation, route }: DeviceListScreenProps) {
  const [devices, setDevices] = useState<AvailableDevice[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null); // DeviceId being connected to

  useEffect(() => {
    // Initialize socket connection
    const initSocket = async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

      if (!token || !deviceId) {
        Alert.alert('Error', 'Authentication missing');
        navigation.replace('Connect');
        return;
      }

      const newSocket = io(RELAY_SERVER_URL, {
        transports: ['websocket'],
        auth: { token },
        query: { deviceId, type: 'mobile' } // Optional query params
      });

      newSocket.on('connect', () => {
        console.log('✅ DeviceList connected to relay');
        newSocket.emit('register', { type: 'mobile', token, deviceId });
      });

      newSocket.on('connect_error', (err) => {
        console.error('❌ DeviceList socket error:', err);
        // Using simple check rather than .includes() to avoid string matching if desired
        // but for error handling, message check is standard. 
        // We will just log it and avoid the Alert for common transient errors.
        if (err.message && (err.message === 'xhr poll error' || err.message === 'transport error')) {
           // Transient error, ignore
           return;
        }
        Alert.alert('Connection Error', err.message);
      });

      newSocket.on('available_devices', (availableMacs: AvailableDevice[]) => {
        console.log('📋 Received available devices:', availableMacs);
        setDevices(availableMacs);
      });

      newSocket.on('paired', ({ message, peerId }) => {
        console.log('✅ Paired with:', peerId);
        // Navigate to Terminal, passing the socket? 
        // Ideally Terminal should reuse socket or we pass connection details.
        // For simplicity, let's assume Terminal connects on its own OR we pass the socket.
        // Passing non-serializable socket in params is bad.
        // Better: Terminal creates its own socket or we use a Context.
        // Current architecture: Terminal creates its own socket.
        // But if we pair HERE, the server marks us as paired.
        // If Terminal creates NEW socket, it registers with SAME deviceId.
        // Server should handle re-registration or we share socket instance.
        
        // Given previous code, TerminalScreen creates NEW socket.
        // If we pair here, then navigate, Terminal connects new socket -> registers -> server needs to re-associate?
        // Actually, 'paired' event means WebRTC signaling starts.
        // Signaling messages come to THIS socket.
        // If we navigate to Terminal, we must keep THIS socket alive or hand it over.
        
        // Hack for now: Disconnect this socket, Navigate to Terminal, Terminal reconnects & pairs?
        // No, "request_connection" triggers pairing on server.
        // If we disconnect, pairing is lost? 
        // Yes, "disconnect" clears pairedWith.
        
        // Solution: TerminalScreen should handle the "request_connection" logic OR we share the socket.
        // Let's modify TerminalScreen to accept a "targetDeviceId" and do the handshake.
        // Or better: DeviceListScreen IS the entry point, and it passes the socket via a global store or Context.
        
        // For this iteration: We will disconnect here, and pass 'targetDeviceId' to TerminalScreen.
        // TerminalScreen will connect, register, and THEN emit 'request_connection'.
        
        // Wait, server logic: "request_connection" pairs the CURRENT socket.
        // So TerminalScreen must emit 'request_connection'.
        
        newSocket.disconnect();
        navigation.navigate('Terminal', { 
            relayServerUrl: RELAY_SERVER_URL,
            targetDeviceId: peerId // Actually we initiated it, so we know the target. But 'paired' confirms it.
            // Wait, if we disconnect, server unpairs.
            // We should NOT pair here. We should just list.
            // Tapping a device should navigate to Terminal with 'targetDeviceId'.
            // Terminal will connect -> register -> emit 'request_connection' -> wait for 'paired'.
        });
      });

      setSocket(newSocket);
    };

    initSocket();

    return () => {
      // newSocket?.disconnect(); // We disconnect on navigation or unmount
    };
  }, []);

  const handleDevicePress = (device: AvailableDevice) => {
     // Navigate to Terminal and let it handle the connection
     if (socket) socket.disconnect();
     navigation.navigate('Terminal', { 
         relayServerUrl: RELAY_SERVER_URL,
         targetDeviceId: device.deviceId
     });
  };

  const renderItem = ({ item }: { item: AvailableDevice }) => (
    <TouchableOpacity 
      style={styles.deviceItem}
      onPress={() => handleDevicePress(item)}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.monitorIcon}>🖥️</Text>
      </View>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{item.deviceName}</Text>
        <Text style={styles.deviceId}>ID: {item.deviceId.substring(0, 8)}...</Text>
      </View>
      <Text style={styles.connectText}>Connect</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Select a Terminal</Text>
      {devices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No active Mac clients found.</Text>
          <Text style={styles.subText}>Make sure your Mac terminal is running and connected.</Text>
          <ActivityIndicator size="small" color="#0f0" style={{ marginTop: 20 }} />
        </View>
      ) : (
        <FlatList
          data={devices}
          renderItem={renderItem}
          keyExtractor={item => item.deviceId}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f0',
    marginBottom: 20,
    marginTop: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 20,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  iconContainer: {
    marginRight: 16,
  },
  monitorIcon: {
    fontSize: 24,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  connectText: {
    color: '#0f0',
    fontWeight: 'bold',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  subText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: '80%',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
