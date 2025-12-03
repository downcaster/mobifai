import React from "react";
import { StyleSheet, View, Text, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import DeviceListScreen from "../screens/DeviceListScreen";
import TerminalScreen from "../screens/TerminalScreen";
import ProfileScreen from "../screens/ProfileScreen";

export type MainTabParamList = {
  Connections: undefined;
  Terminal: { relayServerUrl?: string; targetDeviceId?: string; targetDeviceName?: string } | undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

interface TabIconProps {
  focused: boolean;
  label: string;
  icon: string;
}

function TabIcon({ focused, label, icon }: TabIconProps): React.ReactElement {
  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>
        {icon}
      </Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
        {label}
      </Text>
    </View>
  );
}

export default function MainTabNavigator(): React.ReactElement {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        tabBarActiveTintColor: "#6200EE",
        tabBarInactiveTintColor: "#888",
      }}
    >
      <Tab.Screen
        name="Connections"
        component={DeviceListScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Connect" icon="◉" />
          ),
        }}
      />
      <Tab.Screen
        name="Terminal"
        component={TerminalScreen}
        initialParams={undefined}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Terminal" icon="▣" />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Profile" icon="●" />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#1a1a1a",
    borderTopWidth: 1,
    borderTopColor: "#333",
    height: Platform.OS === "ios" ? 88 : 64,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 8,
  },
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabIcon: {
    fontSize: 20,
    color: "#666",
    marginBottom: 4,
  },
  tabIconActive: {
    color: "#6200EE",
  },
  tabLabel: {
    fontSize: 10,
    color: "#666",
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "sans-serif",
    fontWeight: "500",
  },
  tabLabelActive: {
    color: "#6200EE",
  },
});

