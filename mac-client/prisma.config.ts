import { defineConfig } from "prisma/config";
import * as path from "path";
import * as os from "os";

const MOBIFAI_DIR = path.join(os.homedir(), ".mobifai");
const DB_PATH = path.join(MOBIFAI_DIR, "state.db");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: `file:${DB_PATH}`,
  },
});
