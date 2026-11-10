import { readFileSync } from "node:fs";
import type { ClientBase, PoolConfig } from "pg";

export async function initializeIntegrationSession(client: ClientBase): Promise<void> {
  try {
    // Supabase session pooling can retain server defaults instead of forwarding
    // arbitrary startup GUCs. Apply session-local limits before leasing a client.
    await client.query(`SELECT
      set_config('statement_timeout','12s',false),
      set_config('lock_timeout','5s',false),
      set_config('idle_in_transaction_session_timeout','10s',false)`);
    const limits = (await client.query(`SELECT
      current_setting('statement_timeout') AS statement,
      current_setting('lock_timeout') AS lock,
      current_setting('idle_in_transaction_session_timeout') AS idle`)).rows[0];
    if (limits?.statement !== "12s" || limits?.lock !== "5s" || limits?.idle !== "10s") {
      throw new Error();
    }
  } catch {
    // pg-pool destroys a connection whose awaited onConnect hook fails.
    throw new Error("Integration session timeout initialization/verification failed");
  }
}

export function buildDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
  readCertificate: (path: string) => string = (path) => readFileSync(path, "utf8"),
): PoolConfig {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  let url: URL;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error("DATABASE_URL must use a PostgreSQL URL with a hostname.");
  }
  const mode = env.DATABASE_TLS_MODE || (env.NODE_ENV === "production" ? "verify-full" : "disable");
  if (!["disable", "verify-full"].includes(mode) ||
      (env.NODE_ENV === "production" && mode !== "verify-full")) {
    throw new Error("Production requires DATABASE_TLS_MODE=verify-full.");
  }
  // pg parses URL options after the explicit config. Do not permit a URL to
  // replace certificate validation, connection identity or session settings.
  if (mode === "verify-full" && [...url.searchParams.keys()].length) {
    throw new Error("Verified TLS requires DATABASE_URL without query parameters; configure the driver explicitly.");
  }
  if (mode === "verify-full" && env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("Global TLS certificate verification must remain enabled.");
  }
  let ca: string | undefined;
  if (mode === "verify-full" && env.DATABASE_CA_CERT_PATH) {
    try { ca = readCertificate(env.DATABASE_CA_CERT_PATH); }
    catch { throw new Error("Unable to read DATABASE_CA_CERT_PATH."); }
    if (!ca.trim()) throw new Error("DATABASE_CA_CERT_PATH must contain a CA certificate.");
  }
  if (env.INTEGRATION_DATABASE_SAFETY_LIMITS && env.INTEGRATION_DATABASE_SAFETY_LIMITS !== "enabled") {
    throw new Error("Invalid integration database safety mode");
  }
  return {
    ...(env.INTEGRATION_DATABASE_SAFETY_LIMITS === "enabled" ? {
      // Server-enforced cancellation; a client-only query timer cannot prove
      // that PostgreSQL stopped executing before teardown releases its lock.
      statement_timeout: 12000,
      lock_timeout: 5000,
      idle_in_transaction_session_timeout: 10000,
      onConnect: initializeIntegrationSession,
    } : {}),
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    application_name: "fruits-and-roots-backend",
    ssl: mode === "verify-full" ? { rejectUnauthorized: true, minVersion: "TLSv1.2", ...(ca ? { ca } : {}) } : false,
  };
}
