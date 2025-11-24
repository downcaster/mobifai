import React, { useEffect, useState } from 'react';
import { View, ScrollView, Alert, StyleSheet } from 'react-native';
import { AppView, AppText, AppCard, AppButton } from '../components/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RELAY_SERVER_URL } from '../config';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

const TOKEN_KEY = 'mobifai_auth_token';

type RootStackParamList = {
  Settings: undefined;
  Connect: undefined;
  Terminal: undefined;
  DeviceList: undefined;
};

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

interface SettingsScreenProps {
  navigation: SettingsScreenNavigationProp;
}

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const [settings, setSettings] = useState({
    theme: 'dark', // Default to Dark
    fontSize: 14,
    cursorStyle: 'block',
    fontFamily: 'monospace'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      
      console.log('🔍 Fetching settings...');
      console.log('📍 URL:', `${RELAY_SERVER_URL}/api/settings`);
      console.log('🔑 Token:', token ? `${token.substring(0, 20)}...` : 'No token');
      
      if (!token) {
        Alert.alert('Error', 'Not authenticated');
        navigation.goBack();
        return;
      }

      const response = await fetch(`${RELAY_SERVER_URL}/api/settings`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Response error:', errorData);
        throw new Error(`Failed to fetch settings: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Settings received:', data);
      setSettings(prev => ({ ...prev, ...data }));
    } catch (error) {
      console.error('❌ Error fetching settings:', error);
      Alert.alert('Error', `Failed to load settings: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: string, value: string | number) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings); // Optimistic update

    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      
      if (!token) {
        Alert.alert('Error', 'Not authenticated');
        return;
      }

      const response = await fetch(`${RELAY_SERVER_URL}/api/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [key]: value }),
      });

      if (!response.ok) {
        throw new Error('Failed to update settings');
      }

      const updatedSettings = await response.json();
      setSettings(prev => ({ ...prev, ...updatedSettings }));
      
      console.log('✅ Settings updated successfully');
    } catch (error) {
      console.error('Error updating settings:', error);
      Alert.alert('Error', 'Failed to update settings');
      // Revert optimistic update
      setSettings(settings);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? This will disconnect your current session.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(TOKEN_KEY);
              await AsyncStorage.removeItem('mobifai_device_id');
              
              navigation.reset({
                index: 0,
                routes: [{ name: 'Connect' }],
              });
            } catch (e) {
              console.error('Logout error:', e);
            }
          }
        }
      ]
    );
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

        {/* Account Section */}
        <AppCard>
          <AppText variant="h3" style={styles.sectionTitle}>Account</AppText>
          <AppButton 
            title="Sign Out" 
            variant="outline"
            onPress={handleLogout}
            style={styles.logoutButton}
          />
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
  logoutButton: { borderColor: colors.error, marginTop: spacing.s },
});
