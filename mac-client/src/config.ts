/**
 * Mac Client Configuration
 *
 * Configured via .env and .env.production files.
 * Always loads .env first, then .env.production overrides in production mode.
 * This ensures keys defined in .env but not in .env.production are still available.
 */

import dotenv from "dotenv";
import path from "path";

const isProduction = process.env.APP_ENV === "production";

// Always load .env first as base configuration
const baseResult = dotenv.config({ path: path.resolve(process.cwd(), ".env") });
if (baseResult.error) {
  console.warn(`⚠️  Warning: .env not found`);
}

// In production, override with .env.production values
if (isProduction) {
  const prodResult = dotenv.config({
    path: path.resolve(process.cwd(), ".env.production"),
    override: true,
  });
  if (prodResult.error) {
    console.warn(
      `⚠️  Warning: .env.production not found, using .env values only`
    );
  }
}

console.log(
  `Mac Client Config: ${isProduction ? "Production" : "Development"} mode`
);

// Get values
const RELAY_SERVER_URL = process.env.RELAY_SERVER_URL;
const DEBUG = process.env.DEBUG;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Validate required environment variables
if (!RELAY_SERVER_URL) {
  throw new Error(
    "\n❌ RELAY_SERVER_URL is not set!\n" +
      "Create a .env (or .env.production) file with:\n" +
      "  RELAY_SERVER_URL=https://your-server.onrender.com\n"
  );
}

if (!ANTHROPIC_API_KEY) {
  throw new Error(
    "\n❌ ANTHROPIC_API_KEY is not set!\n" +
      "Create a .env (or .env.production) file with:\n" +
      "  ANTHROPIC_API_KEY=sk-ant-...\n"
  );
}

// Parse boolean
const DEBUG_BOOL = DEBUG?.toLowerCase() === "true" || DEBUG === "1";

// Export
export const config = {
  RELAY_SERVER_URL,
  ANTHROPIC_API_KEY,
  DEBUG: DEBUG_BOOL,
};
