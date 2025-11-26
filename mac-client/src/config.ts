/**
 * Mac Client Configuration
 *
 * Configured via .env and .env.production files.
 * Selects file based on APP_ENV variable.
 */

import dotenv from "dotenv";
import path from "path";

// Select environment file
const envFile = process.env.APP_ENV === "production" ? ".env.production" : ".env";
const result = dotenv.config({ path: path.resolve(process.cwd(), envFile) });

if (result.error && process.env.APP_ENV === "production") {
  console.warn(`⚠️  Warning: .env.production not found, falling back to process.env`);
}

console.log(`🖥️  Mac Client Config: Loading ${envFile}`);

// Get values
const RELAY_SERVER_URL = process.env.RELAY_SERVER_URL;
const DEBUG = process.env.DEBUG;

// Validate
if (!RELAY_SERVER_URL) {
  throw new Error(
    "\n❌ RELAY_SERVER_URL is not set!\n" +
      "Create a .env (or .env.production) file with:\n" +
      "  RELAY_SERVER_URL=https://your-server.onrender.com\n"
  );
}

// Parse boolean
const DEBUG_BOOL = DEBUG?.toLowerCase() === "true" || DEBUG === "1";

// Export
export const config = {
  RELAY_SERVER_URL,
  DEBUG: DEBUG_BOOL,
};
