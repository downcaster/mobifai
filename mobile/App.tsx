import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ConnectScreen from './src/screens/ConnectScreen';
import TerminalScreen from './src/screens/TerminalScreen';
import DeviceListScreen from './src/screens/DeviceListScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export type RootStackParamList = {
  Connect: undefined;
  DeviceList: undefined;
  Terminal: { relayServerUrl: string; targetDeviceId?: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />
        <Stack.Navigator
          initialRouteName="Connect"
          screenOptions={{
            headerShown: false // We use custom headers in our screens now
          }}
        >
          <Stack.Screen
            name="Connect"
            component={ConnectScreen}
          />
          <Stack.Screen
            name="DeviceList"
            component={DeviceListScreen}
          />
          <Stack.Screen
            name="Terminal"
            component={TerminalScreen}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
