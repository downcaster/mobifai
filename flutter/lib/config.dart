/// Mobile App Configuration
///
/// Configure via environment or modify defaults here.
library;

class Config {
  /// Relay server URL for signaling
  static const String relayServerUrl = String.fromEnvironment(
    'RELAY_SERVER_URL',
    defaultValue: 'https://mobifai-relay.onrender.com',
  );

  /// Debug mode
  static const bool debug = bool.fromEnvironment(
    'DEBUG',
    defaultValue: true,
  );

  /// Storage keys
  static const String tokenKey = 'mobifai_auth_token';
  static const String deviceIdKey = 'mobifai_device_id';
  static const String userInfoKey = 'mobifai_user_info';
  static const String connectionStatusKey = 'mobifai_connection_status';
}

