import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemChrome, DeviceOrientation, SystemUiOverlayStyle;
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'theme/colors.dart';
import 'screens/connect_screen.dart';
import 'screens/device_list_screen.dart';
import 'screens/terminal_screen.dart';
import 'screens/profile_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Set preferred orientations
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Set status bar style
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
  ));

  runApp(const MobiFaiApp());
}

class MobiFaiApp extends StatelessWidget {
  const MobiFaiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MobiFai',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const AuthWrapper(),
    );
  }
}

/// Wrapper that handles authentication state
class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  bool _isLoading = true;
  bool _isAuthenticated = false;

  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(Config.tokenKey);
      setState(() {
        _isAuthenticated = token != null;
      });
    } catch (error) {
      debugPrint('Error checking auth: $error');
      setState(() {
        _isAuthenticated = false;
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _onAuthenticated() {
    setState(() {
      _isAuthenticated = true;
    });
  }

  void _onLogout() {
    setState(() {
      _isAuthenticated = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: AppColors.bgPrimary,
        body: Center(
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
          ),
        ),
      );
    }

    if (!_isAuthenticated) {
      return ConnectScreen(onAuthenticated: _onAuthenticated);
    }

    return MainTabNavigator(onLogout: _onLogout);
  }
}

/// Main tab navigator with bottom navigation
class MainTabNavigator extends StatefulWidget {
  final VoidCallback onLogout;

  const MainTabNavigator({super.key, required this.onLogout});

  @override
  State<MainTabNavigator> createState() => _MainTabNavigatorState();
}

class _MainTabNavigatorState extends State<MainTabNavigator> {
  int _currentIndex = 0;

  // Terminal connection params
  String? _relayServerUrl;
  String? _targetDeviceId;

  void _onDeviceSelected(String deviceId) {
    print('📱 Device selected: $deviceId');
    print('   Setting relayServerUrl: ${Config.relayServerUrl}');
    setState(() {
      _relayServerUrl = Config.relayServerUrl;
      _targetDeviceId = deviceId;
      _currentIndex = 1; // Switch to terminal tab
    });
    print('   _currentIndex now: $_currentIndex');
  }

  void _onBackFromTerminal() {
    setState(() {
      _currentIndex = 0; // Switch back to connections tab
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: [
          // Connections tab
          DeviceListScreen(
            onDeviceSelected: _onDeviceSelected,
            onLogout: widget.onLogout,
          ),
          // Terminal tab - use key to force rebuild when device changes
          TerminalScreen(
            key: ValueKey('terminal_$_targetDeviceId'),
            relayServerUrl: _relayServerUrl,
            targetDeviceId: _targetDeviceId,
            onBack: _onBackFromTerminal,
          ),
          // Profile tab
          ProfileScreen(onLogout: widget.onLogout),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.bgSecondary,
          border: Border(
            top: BorderSide(color: AppColors.borderSubtle),
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildNavItem(
                  index: 0,
                  icon: '◎',
                  label: 'Connections',
                ),
                _buildNavItem(
                  index: 1,
                  icon: '▣',
                  label: 'Terminal',
                ),
                _buildNavItem(
                  index: 2,
                  icon: '●',
                  label: 'Profile',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required String icon,
    required String label,
  }) {
    final isSelected = _currentIndex == index;

    return GestureDetector(
      onTap: () {
        setState(() {
          _currentIndex = index;
        });
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.accentSelected : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              icon,
              style: TextStyle(
                fontSize: 20,
                color: isSelected ? AppColors.primary : AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                color: isSelected ? AppColors.primary : AppColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
