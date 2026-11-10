import assert from "node:assert/strict";
import type { Pool, PoolClient } from "pg";
import type { TLSSocket } from "node:tls";
import { fixtureNumber, type ConnectionMethod } from "./integrationTarget";

export function verifyRole(flags: Record<string, boolean>) {
  assert.deepEqual(flags, { expected_role: true, rolcanlogin: true, rolinherit: false,
    rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false });
}

export function verifyDatabaseHop(ssl: unknown, method: ConnectionMethod) {
  if (method !== "session") assert.equal(ssl, true, "Direct database connection must use TLS");
  // Supavisor terminates client TLS. This flag describes only its upstream hop;
  // it cannot replace verifySocket or establish that upstream's certificate trust.
  return { encrypted: ssl === true, certificateValidation: "not established by pg_stat_ssl" };
}

export function verifySocket(client: PoolClient) {
  const socket = (client as unknown as { connection: { stream: TLSSocket } }).connection.stream;
  assert.equal(socket.encrypted, true, "TLS encryption required");
  assert.equal(socket.authorized, true, "Trusted server certificate required");
  return { encrypted: true, certificateAuthorized: true, protocol: socket.getProtocol() };
}

export type PreflightProgress = (check: string) => void;

export function timeoutDiagnostic(value: unknown): string {
  return typeof value === "string" && /^\d{1,10}(?:ms|s|min|h|d)?$/.test(value)
    ? value : "unrecognized";
}

async function verifyDatabaseLimits(client: PoolClient, progress: PreflightProgress, role: string) {
  progress(`${role}: read effective database timeouts`);
  const limits = (await client.query(`SELECT
    current_setting('statement_timeout') AS statement,
    current_setting('lock_timeout') AS lock,
    current_setting('idle_in_transaction_session_timeout') AS idle`)).rows[0];
  for (const [name, expected] of Object.entries({ statement: "12s", lock: "5s", idle: "10s" })) {
    progress(`${role}: verify ${name} timeout (expected=${expected}, observed=${timeoutDiagnostic(limits[name])})`);
    assert.equal(limits[name], expected, "Integration server timeout must be active");
  }
}

// No app imports, fixture writes, role switching or migrations. Counts only, no records.
export async function integrationPreflight(application: Pool, inspector: Pool, runId: string, method: ConnectionMethod = "direct", fixtureId?: string, progress: PreflightProgress = () => undefined) {
  progress("configuration: fixture ID format");
  if (fixtureId && !/^[1-9][0-9]*$/.test(fixtureId)) throw new Error("Invalid separately provisioned fixture ID");
  progress("restricted connection: connect/authenticate/startup parameters");
  const app = await application.connect();
  try {
    progress("restricted connection: trusted TLS");
    const transport = verifySocket(app);
    progress("restricted connection: begin read-only transaction");
    await app.query("BEGIN READ ONLY");
    await verifyDatabaseLimits(app, progress, "restricted connection");
    progress("restricted connection: database role flags");
    const flags = (await app.query(`SELECT current_user = 'fruits_roots_backend' AS expected_role,
      rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication
      FROM pg_roles WHERE rolname=current_user`)).rows[0];
    verifyRole(flags);
    for (const [table, privileges] of Object.entries({
      products: ["SELECT","INSERT","UPDATE","DELETE"], product_variants: ["SELECT","INSERT","UPDATE","DELETE"],
      categories: ["SELECT","INSERT","UPDATE","DELETE"], tags: ["SELECT","INSERT","UPDATE","DELETE"],
      product_tags: ["SELECT","INSERT","DELETE"], orders: ["SELECT","INSERT","UPDATE"],
      payments: ["SELECT","INSERT","UPDATE"], order_items: ["SELECT","INSERT"],
      restaurant_settings: ["SELECT","UPDATE"], restaurant_tables: ["SELECT"], admin_sessions: ["SELECT","INSERT","DELETE"],
    })) {
      for (const privilege of privileges) {
        progress(`restricted grants: ${table} ${privilege}`);
        assert.equal((await app.query(
        "SELECT has_table_privilege(current_user,$1,$2) AS allowed", [`public.${table}`, privilege],
       )).rows[0].allowed, true, "Required runtime grant missing");
      }
    }
    progress("restricted grants: schema, row-lock and forbidden permissions");
    const access = (await app.query(`SELECT
      has_schema_privilege(current_user,'public','USAGE') AS schema_usage,
      has_column_privilege(current_user,'public.restaurant_tables','id','UPDATE') AS row_lock,
      has_schema_privilege(current_user,'public','CREATE') AS schema_create,
      has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
      has_table_privilege(current_user,'public.orders','DELETE') AS delete_orders,
      has_table_privilege(current_user,'public.payments','DELETE') AS delete_payments,
      has_table_privilege(current_user,'public.admin_sessions','UPDATE,TRUNCATE') AS mutate_sessions`)).rows[0];
    assert.deepEqual(access, { schema_usage: true, row_lock: true, schema_create: false,
      database_create: false, delete_orders: false, delete_payments: false, mutate_sessions: false });
    for (const sequence of ["order_number_seq","order_items_id_seq","payments_id_seq","product_variants_id_seq"]) {
      progress(`restricted grants: sequence ${sequence}`);
      const privileges = (await app.query(`SELECT has_sequence_privilege(current_user,$1,'USAGE') AS usage,
        has_sequence_privilege(current_user,$1,'UPDATE') AS reset`, [`public.${sequence}`])).rows[0];
      assert.deepEqual(privileges, { usage: true, reset: false });
    }
    progress("database transport: upstream SSL observation");
    const hop = (await app.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()")).rows[0];
    const databaseHop = verifyDatabaseHop(hop?.ssl, method);
    return { ...await inspect(transport, flags), requiredPermissions: true, databaseHop };
  } finally {
    await app.query("ROLLBACK");
    app.release();
  }

  async function inspect(transport: unknown, flags: unknown) {
    progress("inspector connection: connect/authenticate/startup parameters");
    const owner = await inspector.connect();
    try {
      progress("inspector connection: trusted TLS");
      verifySocket(owner);
      progress("inspector connection: begin read-only transaction");
      await owner.query("BEGIN READ ONLY");
      await verifyDatabaseLimits(owner, progress, "inspector connection");
      const counts: Record<string, number> = {};
      for (const table of ["orders", "order_items", "payments", "admin_sessions", "products",
        "product_variants", "categories", "tags", "product_tags", "restaurant_tables"]) {
        progress(`application row count: ${table}`);
        const count = (await owner.query(`SELECT count(*)::int AS count FROM public.${table}`)).rows[0].count;
        counts[table] = count;
        assert.equal(count, table === "restaurant_tables" && fixtureId ? 1 : 0,
          "Unexpected application records; first-run isolation required");
      }
      progress("registered-table fixture: ID, derived number and active flag");
      const tableFixtureReady = !!fixtureId && (await owner.query(
        "SELECT 1 FROM public.restaurant_tables WHERE id=$1 AND table_number=$2 AND is_active IS TRUE",
        [fixtureId, fixtureNumber(runId)],
      )).rowCount === 1;
      if (fixtureId) assert.equal(tableFixtureReady, true, "Registered-table fixture does not match this run");
      progress("admin sessions: RLS and FORCE RLS");
      const isolation = (await owner.query(`SELECT relrowsecurity, relforcerowsecurity
        FROM pg_class WHERE oid='public.admin_sessions'::regclass`)).rows[0];
      assert.deepEqual(isolation, { relrowsecurity: true, relforcerowsecurity: true });
      for (const role of ["anon", "authenticated"]) {
        progress(`admin sessions: ${role} privilege isolation`);
        const access = (await owner.query(`SELECT
          has_table_privilege($1,'public.admin_sessions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS table_access,
          has_any_column_privilege($1,'public.admin_sessions','SELECT,INSERT,UPDATE,REFERENCES') AS column_access,
          pg_has_role($1,'fruits_roots_backend','MEMBER') AS backend_member`, [role])).rows[0];
        assert.deepEqual(access, { table_access: false, column_access: false, backend_member: false });
      }
      progress("disposable marker: presence and run match");
      const markerExists = (await owner.query("SELECT to_regclass('fr_test_control.marker') IS NOT NULL AS present")).rows[0].present;
      const markerReady = markerExists && (await owner.query(
        "SELECT count(*)::int AS count FROM fr_test_control.marker WHERE run_id=$1 AND disposable IS TRUE", [runId],
      )).rows[0].count === 1;
      return { transport, role: flags, emptyApplicationTables: counts, sessionIsolation: true, markerReady, tableFixtureReady };
    } finally {
      await owner.query("ROLLBACK");
      owner.release();
    }
  }
}
