/**
 * Mobile App Configuration
 *
 * Configured via .env and .env.production files.
 * Babel plugin selects the file based on NODE_ENV.
 */

import {
  RELAY_SERVER_URL as ENV_RELAY_SERVER_URL,
  DEBUG as ENV_DEBUG,
} from "@env";

const RELAY_SERVER_URL = ENV_RELAY_SERVER_URL;
// Handle string boolean conversion
const DEBUG = ENV_DEBUG === "true";

// Validate
if (!RELAY_SERVER_URL) {
  throw new Error(
    "❌ RELAY_SERVER_URL is missing. Check your .env or .env.production file."
  );
}

// Log startup config (helpful for debugging env switches)
console.log(`📱 Mobile Config: Connecting to ${RELAY_SERVER_URL}`);

// Export
export const config = {
  RELAY_SERVER_URL,
  DEBUG,
};

export { RELAY_SERVER_URL, DEBUG };
