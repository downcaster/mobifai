import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;

import '../config.dart';
import '../theme/colors.dart';
import '../theme/terminal_themes.dart';
import '../models/process.dart';

class ProfileScreen extends StatefulWidget {
  final VoidCallback onLogout;

  const ProfileScreen({super.key, required this.onLogout});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  UserInfo? _userInfo;
  bool _loading = true;

  // Settings
  int _fontSize = 14;
  String _cursorStyle = 'block';
  String _terminalTheme = 'default';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userInfoStr = prefs.getString(Config.userInfoKey);
      if (userInfoStr != null) {
        setState(() {
          _userInfo =
              UserInfo.fromJson(jsonDecode(userInfoStr) as Map<String, dynamic>);
        });
      }
      await _fetchSettings();
    } catch (error) {
      debugPrint('Error loading profile data: $error');
    } finally {
      setState(() {
        _loading = false;
      });
    }
  }

  Future<void> _fetchSettings() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(Config.tokenKey);
      if (token == null) return;

      final response = await http.get(
        Uri.parse('${Config.relayServerUrl}/api/settings'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        setState(() {
          _fontSize = data['fontSize'] as int? ?? 14;
          _cursorStyle = data['cursorStyle'] as String? ?? 'block';
          _terminalTheme = data['terminalTheme'] as String? ?? 'default';
        });
      }
    } catch (error) {
      debugPrint('Error fetching settings: $error');
    }
  }

  Future<void> _updateSetting(String key, dynamic value) async {
    // Optimistic update
    final previousFontSize = _fontSize;
    final previousCursorStyle = _cursorStyle;
    final previousTerminalTheme = _terminalTheme;

    setState(() {
      if (key == 'fontSize') _fontSize = value as int;
      if (key == 'cursorStyle') _cursorStyle = value as String;
      if (key == 'terminalTheme') _terminalTheme = value as String;
    });

    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(Config.tokenKey);
      if (token == null) return;

      final response = await http.put(
        Uri.parse('${Config.relayServerUrl}/api/settings'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({key: value}),
      );

      if (response.statusCode != 200) {
        throw Exception('Failed to update settings');
      }
    } catch (error) {
      debugPrint('Error updating settings: $error');
      // Revert to previous settings on error
      setState(() {
        _fontSize = previousFontSize;
        _cursorStyle = previousCursorStyle;
        _terminalTheme = previousTerminalTheme;
      });
    }
  }

  Future<void> _handleLogout() async {
    final shouldLogout = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.bgSecondary,
        title: const Text('Sign Out',
            style: TextStyle(color: AppColors.textPrimary)),
        content: const Text('Are you sure you want to sign out?',
            style: TextStyle(color: AppColors.textSecondary)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );

    if (shouldLogout == true) {
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(Config.tokenKey);
        await prefs.remove(Config.userInfoKey);
        await prefs.remove(Config.deviceIdKey);
        widget.onLogout();
      } catch (e) {
        debugPrint('Logout error: $e');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        backgroundColor: AppColors.bgPrimary,
        body: Center(
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.only(bottom: 120),
          child: Column(
            children: [
              _buildHeader(),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  children: [
                    _buildDisplaySection(),
                    const SizedBox(height: 28),
                    _buildTerminalSection(),
                    const SizedBox(height: 28),
                    _buildAccountSection(),
                  ],
                ),
              ),
              _buildFooter(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 60, 24, 40),
      child: Column(
        children: [
          // Avatar
          Stack(
            children: [
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.accentGlow,
                ),
              ),
              Positioned(
                top: 5,
                left: 5,
                child: _userInfo?.picture != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(45),
                        child: Image.network(
                          _userInfo!.picture!,
                          width: 90,
                          height: 90,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              _buildAvatarPlaceholder(),
                        ),
                      )
                    : _buildAvatarPlaceholder(),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            _userInfo?.name ?? 'User',
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            _userInfo?.email ?? 'Not signed in',
            style: const TextStyle(
              fontSize: 14,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  String _getAvatarInitial() {
    if (_userInfo?.name != null && _userInfo!.name!.isNotEmpty) {
      return _userInfo!.name!.substring(0, 1).toUpperCase();
    }
    if (_userInfo?.email != null && _userInfo!.email.isNotEmpty) {
      return _userInfo!.email.substring(0, 1).toUpperCase();
    }
    return '?';
  }

  Widget _buildAvatarPlaceholder() {
    return Container(
      width: 90,
      height: 90,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.bgTertiary,
        border: Border.all(color: AppColors.primary, width: 2),
      ),
      child: Center(
        child: Text(
          _getAvatarInitial(),
          style: const TextStyle(
            fontSize: 36,
            color: AppColors.secondary,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget _buildDisplaySection() {
    return _buildSection(
      icon: '◐',
      title: 'Display',
      child: Column(
        children: [
          // Font Size
          _buildSettingItem(
            label: 'Font Size',
            child: Column(
              children: [
                SliderTheme(
                  data: SliderThemeData(
                    activeTrackColor: AppColors.primary,
                    inactiveTrackColor: AppColors.bgTertiary,
                    thumbColor: AppColors.primary,
                    overlayColor: AppColors.primary.withValues(alpha: 0.2),
                    trackHeight: 4,
                  ),
                  child: Slider(
                    value: _fontSize.toDouble(),
                    min: 8,
                    max: 22,
                    divisions: 14,
                    onChanged: (value) {
                      _updateSetting('fontSize', value.toInt());
                    },
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Small',
                        style: TextStyle(
                            fontSize: 12, color: AppColors.textMuted)),
                    Text('$_fontSize',
                        style: TextStyle(
                            fontSize: 14,
                            color: AppColors.secondary,
                            fontWeight: FontWeight.w600)),
                    Text('Large',
                        style: TextStyle(
                            fontSize: 12, color: AppColors.textMuted)),
                  ],
                ),
              ],
            ),
          ),
          const Divider(color: AppColors.borderSubtle, height: 1),
          // Terminal Theme
          _buildSettingItem(
            label: 'Terminal Theme',
            child: SizedBox(
              height: 120,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: TerminalThemes.themes.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final theme = TerminalThemes.themes[index];
                  final isSelected = _terminalTheme == theme.id;

                  return GestureDetector(
                    onTap: () => _updateSetting('terminalTheme', theme.id),
                    child: Column(
                      children: [
                        Stack(
                          children: [
                            if (isSelected)
                              Container(
                                width: 88,
                                height: 88,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(16),
                                  color: AppColors.accentGlow,
                                ),
                              ),
                            Container(
                              width: 80,
                              height: 80,
                              margin: EdgeInsets.all(isSelected ? 4 : 0),
                              decoration: BoxDecoration(
                                color: theme.background,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: isSelected
                                      ? AppColors.primary
                                      : Colors.transparent,
                                  width: 2.5,
                                ),
                              ),
                              child: Center(
                        child: Text(
                          '\$ ls',
                          style: TextStyle(
                            color: theme.foreground,
                                    fontSize: 13,
                                    fontFamily: 'monospace',
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          theme.name,
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTerminalSection() {
    return _buildSection(
      icon: '▣',
      title: 'Terminal',
      child: _buildSettingItem(
        label: 'Cursor Style',
        child: Row(
          children: [
            _buildCursorOption('block', _CursorPreview.block),
            const SizedBox(width: 12),
            _buildCursorOption('underline', _CursorPreview.underline),
            const SizedBox(width: 12),
            _buildCursorOption('bar', _CursorPreview.bar),
          ],
        ),
      ),
    );
  }

  Widget _buildCursorOption(String style, Widget preview) {
    final isSelected = _cursorStyle == style;

    return Expanded(
      child: GestureDetector(
        onTap: () => _updateSetting('cursorStyle', style),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.accentGlow : AppColors.bgTertiary,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? AppColors.primary : Colors.transparent,
              width: 2,
            ),
          ),
          child: Column(
            children: [
              SizedBox(
                height: 32,
                child: Center(child: preview),
              ),
              const SizedBox(height: 8),
              Text(
                style.substring(0, 1).toUpperCase() + style.substring(1),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color:
                      isSelected ? AppColors.textPrimary : AppColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAccountSection() {
    return _buildSection(
      icon: '●',
      title: 'Account',
      child: GestureDetector(
        onTap: _handleLogout,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.red),
          ),
          child: const Center(
            child: Text(
              'Sign Out',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: Colors.red,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSection({
    required String icon,
    required String title,
    required Widget child,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section header
        Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: AppColors.accentGlow,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Center(
                child: Text(
                  icon,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.secondary,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              title.toUpperCase(),
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
                letterSpacing: 1,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Card
        Container(
          decoration: BoxDecoration(
            color: AppColors.bgCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.borderSubtle),
          ),
          child: child,
        ),
      ],
    );
  }

  Widget _buildSettingItem({required String label, required Widget child}) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }

  Widget _buildFooter() {
    return Padding(
      padding: const EdgeInsets.only(top: 40, bottom: 20),
      child: Column(
        children: const [
          Text(
            'MobiFai',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.textMuted,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'v1.0.0 · AI-Powered Terminal',
            style: TextStyle(
              fontSize: 12,
              color: AppColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}

// Cursor preview widgets
class _CursorPreview {
  static Widget get block => Container(
        width: 16,
        height: 20,
        decoration: BoxDecoration(
          color: AppColors.secondary,
          borderRadius: BorderRadius.circular(2),
        ),
      );

  static Widget get underline => Container(
        width: 16,
        height: 3,
        decoration: BoxDecoration(
          color: AppColors.secondary,
          borderRadius: BorderRadius.circular(1),
        ),
      );

  static Widget get bar => Container(
        width: 3,
        height: 20,
        decoration: BoxDecoration(
          color: AppColors.secondary,
          borderRadius: BorderRadius.circular(1),
        ),
      );
}

