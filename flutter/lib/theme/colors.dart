import 'package:flutter/material.dart';

/// App color palette
class AppColors {
  // Primary brand colors
  static const Color primary = Color(0xFF6200EE);
  static const Color primaryVariant = Color(0xFF3700B3);
  static const Color secondary = Color(0xFFBB86FC);
  static const Color accent = Color(0xFF03DAC6);

  // Background colors (dark theme)
  static const Color bgPrimary = Color(0xFF0A0A0F);
  static const Color bgSecondary = Color(0xFF12121A);
  static const Color bgTertiary = Color(0xFF1A1A25);
  static const Color bgCard = Color(0xFF15151F);

  // Surface colors (light theme - kept for reference)
  static const Color surfaceLight = Color(0xFFFFFFFF);
  static const Color backgroundLight = Color(0xFFF5F5F5);

  // Text colors
  static const Color textPrimary = Color(0xFFFFFFFF);
  static const Color textSecondary = Color(0xFF8888AA);
  static const Color textMuted = Color(0xFF555566);
  static const Color textDisabled = Color(0x61000000);
  static const Color textInverse = Color(0xFF000000);

  // Status colors
  static const Color error = Color(0xFFB00020);
  static const Color success = Color(0xFF00FF88);
  static const Color warning = Color(0xFFFFAA00);
  static const Color info = Color(0xFF2196F3);

  // Border colors
  static const Color borderSubtle = Color(0xFF2A2A3A);
  static const Color borderSelected = Color(0xFF6200EE);
  static const Color borderConnecting = Color(0xFFFFAA00);

  // Glow / Accent effects
  static const Color accentGlow = Color(0x4D6200EE); // 30% opacity
  static const Color accentSelected = Color(0x266200EE); // 15% opacity
  static const Color connectingGlow = Color(0x26FFAA00); // 15% opacity

  // Terminal colors
  static const Color terminalBackground = Color(0xFF000000);
  static const Color terminalForeground = Color(0xFF00FF00);
  static const Color terminalCursor = Color(0xFF00FF00);
}

/// App theme data
class AppTheme {
  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.primary,
        secondary: AppColors.secondary,
        surface: AppColors.bgSecondary,
        error: AppColors.error,
      ),
      scaffoldBackgroundColor: AppColors.bgPrimary,
      cardColor: AppColors.bgCard,
      dividerColor: AppColors.borderSubtle,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.bgPrimary,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.bgSecondary,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.textSecondary,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.textPrimary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.secondary,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.bgTertiary,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderSubtle),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderSubtle),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
        labelStyle: const TextStyle(color: AppColors.textSecondary),
        hintStyle: const TextStyle(color: AppColors.textMuted),
      ),
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w700,
          color: AppColors.textPrimary,
        ),
        headlineMedium: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w700,
          color: AppColors.textPrimary,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
        titleMedium: TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          color: AppColors.textPrimary,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: AppColors.textSecondary,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          color: AppColors.textMuted,
        ),
        labelLarge: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
      ),
    );
  }
}

