import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "../screens/ProfileScreen";
import CommandCombinationsScreen from "../screens/CommandCombinationsScreen";

export type ProfileStackParamList = {
  ProfileMain: undefined;
  CommandCombinations: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackNavigator(): React.ReactElement {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="CommandCombinations" component={CommandCombinationsScreen} />
    </Stack.Navigator>
  );
}

