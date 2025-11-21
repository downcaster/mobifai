import React, { useEffect, useState } from 'react';
import { View, ScrollView, Alert, StyleSheet } from 'react-native';
import { AppView, AppText, AppCard, AppButton } from '../components/ui';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RELAY_SERVER_URL } from '../config';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

const TOKEN_KEY = 'mobifai_auth_token';
const DEVICE_ID_KEY = 'mobifai_device_id';

export default function SettingsScreen({ navigation }: any) {
  const [settings, setSettings] = useState({
    theme: 'dark', // Default to Dark
    fontSize: 14,
    cursorStyle: 'block',
    fontFamily: 'monospace'
  });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const initSocket = async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

      if (!token) {
        Alert.alert('Error', 'Not authenticated');
        navigation.goBack();
        return;
      }

      const newSocket = io(RELAY_SERVER_URL, {
        transports: ['websocket'],
        auth: { token },
        query: { deviceId, type: 'mobile' }
      });

      newSocket.on('connect', () => {
        setConnected(true);
        // Fetch initial settings
        newSocket.emit('settings:get');
      });

      newSocket.on('settings:updated', (newSettings) => {
        if (newSettings) {
          // Merge with defaults to ensure all keys exist
          setSettings(prev => ({ ...prev, ...newSettings }));
        }
      });

      setSocket(newSocket);
    };

    initSocket();

    return () => {
      socket?.disconnect();
    };
  }, []);

  const updateSetting = (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings); // Optimistic update
    socket?.emit('settings:update', { [key]: value });
  };

  return (
    <AppView safeArea style={styles.container}>
      <View style={styles.header}>
        <AppButton 
            title="←" 
            variant="ghost" 
            onPress={() => navigation.goBack()} 
            style={styles.backButton}
        />
        <AppText variant="h1">Settings</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Appearance Section */}
        <AppCard style={styles.card}>
          <AppText variant="h3" style={styles.sectionTitle}>Appearance</AppText>
          
          <View style={styles.row}>
            <AppText style={styles.label}>Font Size: {settings.fontSize}px</AppText>
            <View style={styles.buttonRow}>
              <AppButton 
                title="Smaller" 
                variant="outline" 
                onPress={() => updateSetting('fontSize', Math.max(10, settings.fontSize - 1))} 
                style={styles.flex1}
              />
              <AppButton 
                title="Larger" 
                variant="outline" 
                onPress={() => updateSetting('fontSize', Math.min(24, settings.fontSize + 1))} 
                style={styles.flex1}
              />
            </View>
          </View>

          <View>
            <AppText style={styles.label}>Theme</AppText>
            <View style={styles.buttonRow}>
                <AppButton 
                    title="Light" 
                    variant={settings.theme === 'light' ? 'primary' : 'outline'} 
                    onPress={() => updateSetting('theme', 'light')}
                    style={styles.flex1}
                />
                <AppButton 
                    title="Dark" 
                    variant={settings.theme === 'dark' ? 'primary' : 'outline'} 
                    onPress={() => updateSetting('theme', 'dark')}
                    style={styles.flex1}
                />
            </View>
          </View>
        </AppCard>

        {/* Terminal Section */}
        <AppCard>
          <AppText variant="h3" style={styles.sectionTitle}>Terminal</AppText>
          
          <View style={styles.mb6}>
            <AppText style={styles.label}>Cursor Style</AppText>
            <View style={styles.wrapRow}>
                {['block', 'underline', 'bar'].map((style) => (
                    <AppButton 
                        key={style}
                        title={style.charAt(0).toUpperCase() + style.slice(1)}
                        variant={settings.cursorStyle === style ? 'primary' : 'outline'}
                        onPress={() => updateSetting('cursorStyle', style)}
                        style={styles.grow}
                    />
                ))}
            </View>
          </View>
        </AppCard>

      </ScrollView>
    </AppView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.m },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.l },
  backButton: { marginRight: spacing.s },
  content: { paddingBottom: 40 },
  card: { marginBottom: spacing.m },
  sectionTitle: { color: colors.primary, marginBottom: spacing.m },
  row: { marginBottom: spacing.l },
  label: { marginBottom: spacing.s, fontWeight: '500' },
  buttonRow: { flexDirection: 'row', gap: spacing.m },
  flex1: { flex: 1 },
  wrapRow: { flexDirection: 'row', gap: spacing.s, flexWrap: 'wrap' },
  grow: { flexGrow: 1 },
  mb6: { marginBottom: spacing.l },
});
