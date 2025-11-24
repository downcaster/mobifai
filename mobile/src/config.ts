/**
 * Mobile App Configuration
 *
 * ⚠️ EDIT THE VALUE BELOW
 */

// ⚠️ HARDCODED - CHANGE THIS TO YOUR MAC'S IP
const RELAY_SERVER_URL = "http://172.20.10.5:3000";
const DEBUG = false;

// Validate
if (!RELAY_SERVER_URL) {
  throw new Error("❌ RELAY_SERVER_URL is not set!");
}

// Export
export const config = {
  RELAY_SERVER_URL,
  DEBUG,
};

export { RELAY_SERVER_URL, DEBUG };
