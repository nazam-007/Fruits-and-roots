
import "dotenv/config";
import { Pool } from "pg";
import { buildDatabaseConfig } from "./databaseConfig";
import { buildRuntimeDatabaseConfig } from "./productionStartup";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing in .env");
}

export const db = new Pool(process.env.NODE_ENV === "production"
  ? buildRuntimeDatabaseConfig()
  : buildDatabaseConfig());
