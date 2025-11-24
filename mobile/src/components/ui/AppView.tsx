import React from 'react';
import { View, ViewProps, SafeAreaView, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';

export interface AppViewProps extends ViewProps {
  safeArea?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

export function AppView({ safeArea, style, children, ...props }: AppViewProps) {
  const Container = safeArea ? SafeAreaView : View;
  
  return (
    <Container style={[styles.base, style]} {...props}>
      {children}
    </Container>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    backgroundColor: colors.background,
  }
});
