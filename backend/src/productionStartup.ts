import { checkServerIdentity, type TLSSocket, type ConnectionOptions } from "node:tls";
import type { Pool, PoolClient } from "pg";
import { buildDatabaseConfig } from "./databaseConfig";

const runtimeRole = "fruits_roots_backend";
const refusal = "Restricted database startup verification failed.";

export function runtimeDatabaseTarget(env: NodeJS.ProcessEnv) {
  try {
    if (!env.DATABASE_URL) throw new Error();
    const url = new URL(env.DATABASE_URL);
    const user = decodeURIComponent(url.username);
    const database = decodeURIComponent(url.pathname.slice(1));
    // Direct login or project-qualified pooler login, never an administrative role.
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.search || url.hash ||
        !(user === runtimeRole || /^fruits_roots_backend\.[a-z]{20}$/.test(user)) ||
        !database || database.includes("/") ||
        (env.DATABASE_TLS_MODE || (env.NODE_ENV === "production" ? "verify-full" : "disable")) !== "verify-full" ||
        !env.DATABASE_CA_CERT_PATH?.trim() || env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new Error();
    return { host: url.hostname, database };
  } catch { throw new Error(refusal); }
}

// Application pools only; administrative inspection tools retain generic config.
export function buildRuntimeDatabaseConfig(env: NodeJS.ProcessEnv = process.env, readCertificate?: (path: string) => string) {
  runtimeDatabaseTarget(env);
  try { return buildDatabaseConfig(env, readCertificate); }
  catch { throw new Error(refusal); }
}

export function paymentExpiryWorkerEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.PAYMENT_EXPIRY_WORKER_ENABLED;
  if (value !== undefined && value !== "true" && value !== "false") {
    throw new Error("PAYMENT_EXPIRY_WORKER_ENABLED must be true or false.");
  }
  return value === "true";
}

// Migration 014 grants. A comma-list privilege check means ANY, so required
// privileges must be split and checked individually with bool_and (EVERY).
const permissionQuery = `/* runtime_permissions */
WITH required_tables(name,privileges) AS (VALUES
 ('products','SELECT,INSERT,UPDATE,DELETE'),('product_variants','SELECT,INSERT,UPDATE,DELETE'),
 ('categories','SELECT,INSERT,UPDATE,DELETE'),('tags','SELECT,INSERT,UPDATE,DELETE'),
 ('product_tags','SELECT,INSERT,DELETE'),('orders','SELECT,INSERT,UPDATE'),
 ('payments','SELECT,INSERT,UPDATE'),('order_items','SELECT,INSERT'),
 ('restaurant_settings','SELECT,UPDATE'),('restaurant_tables','SELECT'),
 ('admin_sessions','SELECT,INSERT,DELETE')
), required_sequences(name) AS (VALUES
 ('order_number_seq'),('order_items_id_seq'),('payments_id_seq'),('product_variants_id_seq')
), denied_tables(name,privileges) AS (VALUES
 ('orders','DELETE,TRUNCATE,MAINTAIN,REFERENCES,TRIGGER'),
 ('payments','DELETE,TRUNCATE,MAINTAIN,REFERENCES,TRIGGER'),
 ('order_items','UPDATE,DELETE,TRUNCATE,MAINTAIN,REFERENCES,TRIGGER'),
 ('admin_sessions','UPDATE,TRUNCATE,MAINTAIN,REFERENCES,TRIGGER')
)
SELECT
 has_database_privilege(current_user,current_database(),'CONNECT') AS database_connect,
 has_schema_privilege(current_user,'public','USAGE') AS schema_usage,
 NOT (has_schema_privilege(current_user,'public','CREATE') OR
      has_database_privilege(current_user,current_database(),'CREATE')) AS no_creation,
 (SELECT bool_and(COALESCE(has_table_privilege(current_user,to_regclass('public.'||t.name),p.privilege),false))
  FROM required_tables t CROSS JOIN LATERAL unnest(string_to_array(t.privileges,',')) p(privilege)) AS table_permissions,
 has_column_privilege(current_user,'public.restaurant_tables','id','UPDATE') AS table_lock_permission,
 (SELECT bool_and(COALESCE(has_sequence_privilege(current_user,to_regclass('public.'||s.name),'USAGE'),false))
  FROM required_sequences s) AS sequence_permissions,
 (SELECT bool_and(NOT COALESCE(has_sequence_privilege(current_user,to_regclass('public.'||s.name),'UPDATE'),true))
  FROM required_sequences s) AS no_sequence_mutation,
 (SELECT bool_and(NOT COALESCE(has_table_privilege(current_user,to_regclass('public.'||t.name),t.privileges),true))
  FROM denied_tables t) AS no_financial_escalation,
 NOT (has_any_column_privilege(current_user,'public.order_items','UPDATE') OR
      has_any_column_privilege(current_user,'public.admin_sessions','UPDATE')) AS no_column_escalation,
 (SELECT bool_and(EXISTS (
   SELECT 1 FROM pg_class c JOIN pg_policy p ON p.polrelid=c.oid
   WHERE c.oid=to_regclass('public.'||t.name) AND c.relrowsecurity
     AND p.polname='fr_backend_access' AND p.polcmd='*' AND p.polpermissive
     AND (SELECT oid FROM pg_roles WHERE rolname=current_user)=ANY(p.polroles)
     AND pg_get_expr(p.polqual,p.polrelid)='true'
     AND pg_get_expr(p.polwithcheck,p.polrelid)='true'
 )) FROM required_tables t) AS runtime_policies,
 NOT EXISTS (SELECT 1 FROM pg_auth_members
   WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS no_role_membership`;

export async function verifyDatabaseReadiness(pool: Pick<Pool, "connect">, env: NodeJS.ProcessEnv = process.env) {
  const expected = runtimeDatabaseTarget(env);
  let client: PoolClient | undefined;
  let transaction = false;
  let ready = false;
  try {
    client = await pool.connect();
    const connection = client as unknown as { ssl: ConnectionOptions; connection: { stream: TLSSocket } };
    const ssl = connection.ssl, socket = connection.connection.stream;
    if (!ssl || ssl.rejectUnauthorized !== true || !ssl.ca || ssl.checkServerIdentity !== undefined ||
        socket.encrypted !== true || socket.authorized !== true ||
        checkServerIdentity(expected.host, socket.getPeerCertificate()) !== undefined) throw new Error();
    await client.query("BEGIN READ ONLY");
    transaction = true;
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
    const identity = (await client.query(`SELECT current_user,session_user,current_database() AS database,
      current_setting('transaction_read_only') AS read_only,
      r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolinherit
      FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
    if (identity?.current_user !== runtimeRole || identity.session_user !== runtimeRole ||
        identity.database !== expected.database || identity.read_only !== "on" || identity.rolcanlogin !== true ||
        ["rolsuper", "rolbypassrls", "rolcreatedb", "rolcreaterole", "rolreplication", "rolinherit"]
          .some(flag => identity[flag] !== false)) throw new Error();
    const permissions = (await client.query(permissionQuery)).rows[0];
    const checks = ["database_connect", "schema_usage", "no_creation", "table_permissions", "table_lock_permission",
      "sequence_permissions", "no_sequence_mutation", "no_financial_escalation", "no_column_escalation",
      "runtime_policies", "no_role_membership"];
    if (!permissions || checks.some(key => permissions[key] !== true)) throw new Error();
    await client.query("ROLLBACK");
    transaction = false;
    ready = true;
  } catch {
    if (client && transaction) { try { await client.query("ROLLBACK"); } catch { /* Discard failed connection. */ } }
    throw new Error(refusal);
  } finally { client?.release(!ready); }
}

// The executable entry uses this ordering. Tests inject fakes, never a real DB.
export async function startVerifiedRuntime<T>(options: {
  verify: () => Promise<void>; listen: () => Promise<T>;
  workerEnabled: boolean; startWorker: () => void | Promise<void>;
  // Registered before allocations; must also own partially initialized resources.
  cleanup: () => Promise<void>;
}) {
  try {
    await options.verify();
    const listener = await options.listen();
    if (options.workerEnabled) await options.startWorker();
    return listener;
  } catch {
    try { await options.cleanup(); }
    catch { throw new Error("Backend startup cleanup failed."); }
    throw new Error("Backend startup failed.");
  }
}
