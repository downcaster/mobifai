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

  useEffect(() => {
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
        query: { deviceId, type: 'mobile' }
      });

      newSocket.on('connect', () => {
        console.log('✅ DeviceList connected');
        newSocket.emit('register', { type: 'mobile', token, deviceId });
      });

      newSocket.on('available_devices', (availableMacs: AvailableDevice[]) => {
        setDevices(availableMacs);
      });

      setSocket(newSocket);
    };

    initSocket();

    return () => {
      socket?.disconnect();
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
        <AppButton 
            title="⚙️ Settings" 
            variant="ghost" 
            onPress={() => navigation.navigate('Settings')} 
        />
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
