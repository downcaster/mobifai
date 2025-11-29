/**
 * Relay Server Configuration
 * 
 * Create a .env file with all required variables.
 * See .env.example for reference.
 * 
 * Always loads .env first, then .env.production overrides in production mode.
 * This ensures keys defined in .env but not in .env.production are still available.
 */

import dotenv from "dotenv";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";

// Always load .env first as base configuration
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

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

console.log(`🔄 Relay Server Config: ${isProduction ? "Production" : "Development"} mode`);

// Get required values
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const SERVER_URL = process.env.SERVER_URL;
const DATABASE_URL = process.env.DATABASE_URL;

// Get optional values with defaults
const PORT = process.env.PORT || "3000";
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";
const COOKIE_KEY = process.env.COOKIE_KEY || "mobifai-session-secret";

// Validate required
if (!GOOGLE_CLIENT_ID) throw new Error("❌ GOOGLE_CLIENT_ID is required in .env");
if (!GOOGLE_CLIENT_SECRET) throw new Error("❌ GOOGLE_CLIENT_SECRET is required in .env");
if (!JWT_SECRET) throw new Error("❌ JWT_SECRET is required in .env");
if (!SERVER_URL) throw new Error("❌ SERVER_URL is required in .env");
if (!DATABASE_URL) throw new Error("❌ DATABASE_URL is required in .env");

// Parse PORT as number
const PORT_NUM = parseInt(PORT, 10);
if (isNaN(PORT_NUM)) throw new Error("❌ PORT must be a number");

// Export
export const config = {
  PORT: PORT_NUM,
  HOST,
  NODE_ENV: NODE_ENV as "development" | "production" | "test",
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  JWT_SECRET,
  COOKIE_KEY,
  SERVER_URL,
  DATABASE_URL,
};
