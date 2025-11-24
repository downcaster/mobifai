/**
 * Mac Client Configuration
 * 
 * Create a .env file with:
 *   RELAY_SERVER_URL=http://YOUR_MAC_IP:3000
 *   DEBUG=false
 */

import dotenv from "dotenv";

dotenv.config();

// Get values
const RELAY_SERVER_URL = process.env.RELAY_SERVER_URL;
const DEBUG = process.env.DEBUG;

// Validate
if (!RELAY_SERVER_URL) {
  throw new Error(
    "\n❌ RELAY_SERVER_URL is not set!\n" +
      "Create a .env file with:\n" +
      "  RELAY_SERVER_URL=http://YOUR_MAC_IP:3000\n"
  );
}

// Parse boolean
const DEBUG_BOOL = DEBUG?.toLowerCase() === "true" || DEBUG === "1";

// Export
export const config = {
  RELAY_SERVER_URL,
  DEBUG: DEBUG_BOOL,
};
