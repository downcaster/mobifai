import React, { useEffect, useState } from 'react';
import { View, FlatList, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { io, Socket } from 'socket.io-client';
import { RELAY_SERVER_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppView, AppText, AppButton, AppCard } from '../components/ui';
import { spacing } from '../theme/spacing';
import { colors } from '../theme/colors';
import { generateKeyPair } from '../utils/crypto';

type DeviceListScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DeviceList'>;
  route: any;
};

type AvailableDevice = {
  deviceId: string;
  deviceName: string;
  status: string;
};

const TOKEN_KEY = 'mobifai_auth_token';
const DEVICE_ID_KEY = 'mobifai_device_id';

export default function DeviceListScreen({ navigation }: DeviceListScreenProps) {
  const [devices, setDevices] = useState<AvailableDevice[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  
  // Store session keys
  const [keyPair, setKeyPair] = useState<{publicKey: string; privateKey: string} | null>(null);

  useEffect(() => {
    let newSocket: Socket | null = null;

    const initSocket = async () => {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

        console.log('📱 DeviceList: Initializing socket...');

        if (!token || !deviceId) {
          console.log('❌ DeviceList: Missing credentials');
          Alert.alert('Error', 'Authentication missing');
          navigation.replace('Connect');
          return;
        }
        
        // Generate fresh keys for this session
        const keys = generateKeyPair();
        setKeyPair(keys);
        console.log('🔐 DeviceList: Generated session keys');

        newSocket = io(RELAY_SERVER_URL, {
          transports: ['websocket'],
          auth: { token },
          query: { deviceId, type: 'mobile' },
          forceNew: true, // Ensure fresh connection
        });

        newSocket.on('connect', () => {
          console.log('✅ DeviceList: Socket connected', newSocket?.id);
          newSocket?.emit('register', { 
              type: 'mobile', 
              token, 
              deviceId,
              publicKey: keys.publicKey // <--- Sending Public Key!
          });
        });
        
        newSocket.on('error', (err) => {
             console.error('❌ DeviceList: Server error:', err);
             Alert.alert('Connection Error', err.message || 'Unknown error');
        });

        newSocket.on('available_devices', (availableMacs: AvailableDevice[]) => {
          console.log('📲 DeviceList: Received devices:', JSON.stringify(availableMacs));
          setDevices(availableMacs);
        });
        
        newSocket.on('disconnect', (reason) => {
            console.log('❌ DeviceList: Socket disconnected:', reason);
        });

        setSocket(newSocket);
      } catch (e) {
        console.error("❌ DeviceList: Init error", e);
      }
    };

    initSocket();

    return () => {
      console.log('🧹 DeviceList: Cleaning up socket');
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, []);

  const handleDevicePress = (device: AvailableDevice) => {
     if (socket) socket.disconnect();
     navigation.navigate('Terminal', { 
         relayServerUrl: RELAY_SERVER_URL,
         targetDeviceId: device.deviceId
     });
  };

  return (
    <AppView safeArea style={styles.container}>
      <View style={styles.header}>
        <AppText variant="h1" weight="bold">Terminals</AppText>
        <View style={{flexDirection: 'row', gap: 10}}>
            <AppButton 
                title="🔄" 
                variant="ghost" 
                onPress={() => {
                    if (socket && keyPair) {
                        console.log('🔄 Requesting device list...');
                        AsyncStorage.getItem(DEVICE_ID_KEY).then(did => {
                             AsyncStorage.getItem(TOKEN_KEY).then(token => {
                                 socket.emit('register', { 
                                     type: 'mobile', 
                                     token, 
                                     deviceId: did,
                                     publicKey: keyPair.publicKey
                                 });
                             });
                        });
                    }
                }} 
            />
            <AppButton 
                title="⚙️ Settings" 
                variant="ghost" 
                onPress={() => navigation.navigate('Settings')} 
            />
        </View>
      </View>

      {devices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <AppText style={styles.emptyText}>No active Mac clients found.</AppText>
          <AppText variant="caption" style={styles.subText}>Make sure your Mac terminal is running.</AppText>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={item => item.deviceId}
          renderItem={({ item }) => (
            <AppCard style={styles.deviceCard}>
                <View style={styles.deviceRow}>
                    <View>
                        <AppText variant="h3" weight="bold">{item.deviceName}</AppText>
                        <AppText variant="caption">ID: {item.deviceId.substring(0, 8)}...</AppText>
                    </View>
                    <AppButton 
                        title="Connect" 
                        onPress={() => handleDevicePress(item)} 
                        style={styles.connectButton}
                    />
                </View>
            </AppCard>
          )}
        />
      )}
    </AppView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.m },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.l },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: colors.text.secondary, marginBottom: spacing.s },
  subText: { textAlign: 'center', marginBottom: spacing.m },
  deviceCard: { marginBottom: spacing.s },
  deviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  connectButton: { paddingVertical: 8, paddingHorizontal: 16 },
});
