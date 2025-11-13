// Configuration for mobile app
// Note: React Native doesn't support .env files without additional libraries
// 
// ⚠️ CHANGE THESE VALUES TO MATCH YOUR NETWORK:
// 1. Find your Mac's local IP: System Settings → Network → Wi-Fi → Details
// 2. Update MAC_IP and RELAY_SERVER_URL below
// 3. For iOS Simulator, use 'localhost' (simulator shares host network)
// 4. For Physical Device, use your Mac's IP address on local network

const getEnvVar = (key: string, defaultValue: string): string => {
  // Configuration values
  // TODO: Update these to match your network setup
  const envVars: Record<string, string> = {
    MAC_IP: '192.168.1.102',                    // Your Mac's local IP address
    RELAY_SERVER_URL: 'http://192.168.1.102:3000', // Relay server URL
    DEBUG_MODE: 'true',
  };
  
  return envVars[key] || defaultValue;
};

export const MAC_IP = getEnvVar('MAC_IP', '192.168.1.102');
export const RELAY_SERVER_URL = getEnvVar('RELAY_SERVER_URL', 'http://192.168.1.102:3000');
export const DEBUG_MODE = getEnvVar('DEBUG_MODE', 'true') === 'true';
