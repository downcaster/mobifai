import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import chalk from "chalk";

// Database directory and file path
export const MOBIFAI_DIR = path.join(os.homedir(), ".mobifai");
export const DB_PATH = path.join(MOBIFAI_DIR, "state.db");

/**
 * Ensure the .mobifai directory exists
 */
function ensureDbDirectory(): void {
  if (!fs.existsSync(MOBIFAI_DIR)) {
    fs.mkdirSync(MOBIFAI_DIR, { recursive: true });
    console.log(chalk.gray(`📁 Created directory: ${MOBIFAI_DIR}`));
  }
}

// Ensure directory exists on module load
ensureDbDirectory();

// Create and export the Prisma client instance (singleton)
let prisma: PrismaClient | null = null;

/**
 * Get the Prisma client instance (singleton)
 * Uses libSQL adapter for SQLite
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    // Create Prisma adapter with libSQL config
    const adapter = new PrismaLibSql({
      url: `file:${DB_PATH}`,
    });

    // Create PrismaClient with adapter
    prisma = new PrismaClient({
      adapter,
      log:
        process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

    console.log(chalk.gray(`🗄️  Database initialized at: ${DB_PATH}`));
  }
  return prisma;
}

/**
 * Disconnect Prisma client (for cleanup)
 */
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
