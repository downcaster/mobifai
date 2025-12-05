import React, { useEffect, useState } from "react";
import { StatusBar, ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ConnectScreen from "./src/screens/ConnectScreen";
import MainTabNavigator from "./src/navigation/MainTabNavigator";
import { QueryProvider } from "./src/services/QueryProvider";

const TOKEN_KEY = "mobifai_auth_token";

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App(): React.ReactElement {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async (): Promise<void> => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      setIsAuthenticated(!!token);
    } catch (error) {
      console.error("Error checking auth:", error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" }}
        >
          <ActivityIndicator size="large" color="#6200EE" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <QueryProvider>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          <Stack.Navigator
            initialRouteName={isAuthenticated ? "Main" : "Auth"}
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="Auth" component={ConnectScreen} />
            <Stack.Screen name="Main" component={MainTabNavigator} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryProvider>
  );
}
