import React from "react";
import { Text, TextProps, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";

export interface AppTextProps extends TextProps {
  variant?: "h1" | "h2" | "h3" | "body" | "label" | "caption";
  weight?: "regular" | "medium" | "bold";
  style?: any;
  className?: string; // Ignored but kept for compatibility during migration
}

export function AppText({
  variant = "body",
  weight = "regular",
  style,
  ...props
}: AppTextProps) {
  return (
    <Text
      style={[styles.base, styles[variant], styles[weight], style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    color: colors.text.primary,
    fontFamily: typography.fontFamily.regular,
  },
  h1: { fontSize: 32, marginBottom: 8, color: colors.text.primary },
  h2: { fontSize: 24, marginBottom: 8, color: colors.text.primary },
  h3: { fontSize: 20, marginBottom: 4, color: colors.text.primary },
  body: { fontSize: 16, color: colors.text.primary },
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.text.secondary,
  },
  caption: { fontSize: 12, color: colors.text.secondary },

  regular: { fontWeight: "400" },
  medium: { fontWeight: "500" },
  bold: { fontWeight: "700" },
});
