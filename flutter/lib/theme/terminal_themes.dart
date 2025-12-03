import 'package:flutter/material.dart';

/// Terminal color theme configuration
class TerminalTheme {
  final String id;
  final String name;
  final Color background;
  final Color foreground;
  final Color cursor;
  final Color cursorAccent;

  const TerminalTheme({
    required this.id,
    required this.name,
    required this.background,
    required this.foreground,
    required this.cursor,
    required this.cursorAccent,
  });
}

/// Available terminal themes
class TerminalThemes {
  static const List<TerminalTheme> themes = [
    TerminalTheme(
      id: 'default',
      name: 'Classic',
      background: Color(0xFF000000),
      foreground: Color(0xFF00FF00),
      cursor: Color(0xFF00FF00),
      cursorAccent: Color(0xFF000000),
    ),
    TerminalTheme(
      id: 'light',
      name: 'Light',
      background: Color(0xFFFFFFFF),
      foreground: Color(0xFF000000),
      cursor: Color(0xFF000000),
      cursorAccent: Color(0xFFFFFFFF),
    ),
    TerminalTheme(
      id: 'high-contrast',
      name: 'High Contrast',
      background: Color(0xFF000000),
      foreground: Color(0xFFFFFFFF),
      cursor: Color(0xFFFFFFFF),
      cursorAccent: Color(0xFF000000),
    ),
    TerminalTheme(
      id: 'oceanic',
      name: 'Oceanic',
      background: Color(0xFF1E2436),
      foreground: Color(0xFF89DDFF),
      cursor: Color(0xFF89DDFF),
      cursorAccent: Color(0xFF1E2436),
    ),
    TerminalTheme(
      id: 'monokai',
      name: 'Monokai',
      background: Color(0xFF272822),
      foreground: Color(0xFFFD971F),
      cursor: Color(0xFFFD971F),
      cursorAccent: Color(0xFF272822),
    ),
    TerminalTheme(
      id: 'dracula',
      name: 'Dracula',
      background: Color(0xFF282A36),
      foreground: Color(0xFFBD93F9),
      cursor: Color(0xFFBD93F9),
      cursorAccent: Color(0xFF282A36),
    ),
    TerminalTheme(
      id: 'solarized',
      name: 'Solarized',
      background: Color(0xFF002B36),
      foreground: Color(0xFF2AA198),
      cursor: Color(0xFF2AA198),
      cursorAccent: Color(0xFF002B36),
    ),
    TerminalTheme(
      id: 'nord',
      name: 'Nord',
      background: Color(0xFF2E3440),
      foreground: Color(0xFF88C0D0),
      cursor: Color(0xFF88C0D0),
      cursorAccent: Color(0xFF2E3440),
    ),
    TerminalTheme(
      id: 'tokyo-night',
      name: 'Tokyo Night',
      background: Color(0xFF1A1B26),
      foreground: Color(0xFFC0CAF5),
      cursor: Color(0xFFC0CAF5),
      cursorAccent: Color(0xFF1A1B26),
    ),
    TerminalTheme(
      id: 'catppuccin',
      name: 'Catppuccin',
      background: Color(0xFF1E1E2E),
      foreground: Color(0xFFCDD6F4),
      cursor: Color(0xFFF5E0DC),
      cursorAccent: Color(0xFF1E1E2E),
    ),
  ];

  /// Get theme by ID, returns default if not found
  static TerminalTheme getById(String id) {
    return themes.firstWhere(
      (theme) => theme.id == id,
      orElse: () => themes.first,
    );
  }

  /// Default theme
  static TerminalTheme get defaultTheme => themes.first;
}

