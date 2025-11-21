import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// Use a default connection string if not provided, but warn
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("⚠️  DATABASE_URL is not set. Database features will fail.");
}

const pool = new pg.Pool({
  connectionString,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export const initDb = async () => {
  if (!connectionString) return;

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        photo TEXT,
        settings JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database initialized (users table ready)");
  } catch (err) {
    console.error("❌ Database initialization failed:", err);
  } finally {
    client.release();
  }
};

export default pool;
