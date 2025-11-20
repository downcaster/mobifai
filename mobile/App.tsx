import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConnectScreen from './src/screens/ConnectScreen';
import TerminalScreen from './src/screens/TerminalScreen';

import DeviceListScreen from './src/screens/DeviceListScreen';

export type RootStackParamList = {
  Connect: undefined;
  DeviceList: undefined;
  Terminal: { relayServerUrl: string; targetDeviceId?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Stack.Navigator
        initialRouteName="Connect"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#000',
          },
          headerTintColor: '#0f0',
          headerTitleStyle: {
            fontFamily: 'monospace',
          },
        }}
      >
        <Stack.Screen
          name="Connect"
          component={ConnectScreen}
          options={{ title: 'MobiFai - Connect' }}
        />
        <Stack.Screen
          name="DeviceList"
          component={DeviceListScreen}
          options={{ title: 'Available Terminals' }}
        />
        <Stack.Screen
          name="Terminal"
          component={TerminalScreen}
          options={{ title: 'Terminal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
