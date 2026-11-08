
import "dotenv/config";
import { Pool } from "pg";
import { buildDatabaseConfig } from "./databaseConfig";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing in .env");
}

export const db = new Pool(buildDatabaseConfig());
