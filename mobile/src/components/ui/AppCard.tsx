import React from 'react';
import { View, ViewProps, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

export interface AppCardProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
  className?: string;
}

export function AppCard({ style, children, ...props }: AppCardProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.layout.borderRadius,
    padding: spacing.layout.cardPadding,
    marginBottom: spacing.m,
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    // Border
    borderWidth: 1,
    borderColor: colors.border,
  }
});
