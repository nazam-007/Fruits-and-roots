import assert from "node:assert/strict";
import type { Pool, PoolClient } from "pg";
import type { TestContext } from "node:test";
import { verifyRole, verifySocket } from "./integrationPreflight";
import { buildDatabaseConfig } from "../../src/databaseConfig";
import { DataApiProbeError } from "./integrationDataApi";

export function inspectorConfig(env: NodeJS.ProcessEnv, databaseUrl: string) {
  const config = buildDatabaseConfig({ ...env, NODE_ENV: "production", DATABASE_TLS_MODE: "verify-full", DATABASE_URL: databaseUrl });
  return { ...config, options: "-c default_transaction_read_only=on" };
}

export class WriteApprovalError extends Error {
  constructor(field: "INTEGRATION_ALLOW_WRITES" | "INTEGRATION_APPROVED_PROJECT_REF" | "INTEGRATION_EXCLUSIVE_ACCESS_CONFIRMED") {
    super(`Write approval required: ${field} is missing or does not match its required value.`);
    this.name = "WriteApprovalError";
  }
}

export function requireWriteApproval(env: NodeJS.ProcessEnv) {
  for (const [field, required] of Object.entries({
    INTEGRATION_ALLOW_WRITES: "I_ACKNOWLEDGE_DISPOSABLE_ONLY",
    INTEGRATION_APPROVED_PROJECT_REF: "wznkpgpexjexxzptuuwp",
    INTEGRATION_EXCLUSIVE_ACCESS_CONFIRMED: "NO_OTHER_APPLICATIONS_OR_TEST_RUNNERS",
  }) as [ConstructorParameters<typeof WriteApprovalError>[0], string][]) {
    if (env[field] !== required) throw new WriteApprovalError(field);
  }
}

export { fixtureNumber } from "./integrationTarget";

// Held on a dedicated session, never returned to the pool until teardown.
// All cooperating runs use the same database-wide key, independent of run UUID.
export async function acquireRunLock(client: PoolClient) {
  verifySocket(client);
  const role = (await client.query(`SELECT current_user='fruits_roots_backend' AS expected_role,
    rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication
    FROM pg_roles WHERE rolname=current_user`)).rows[0];
  verifyRole(role);
  const result = await client.query("SELECT pg_try_advisory_lock(1718775654,505) AS acquired");
  assert.equal(result.rows[0].acquired, true, "Another integration run owns this database");
  return async () => { await client.query("SELECT pg_advisory_unlock(1718775654,505)"); };
}

type Settings = { accepting_orders: boolean; opening_hours: unknown; updated_at: string; version: string };

// Restricted-role fixture updates use an atomic revision check. This does NOT
// change the production settings API or pretend its PATCH route was exercised.
export async function captureSettings(db: Pick<Pool, "query">, record: (value: unknown) => void) {
  const original = (await db.query(`SELECT accepting_orders,opening_hours,
    updated_at::text AS updated_at,xmin::text AS version FROM public.restaurant_settings WHERE id=1`)).rows[0] as Settings | undefined;
  assert.ok(original, "Restaurant settings singleton missing");
  record({ event: "original-settings", settings: original });
  let version = original.version;
  let changed = false;
  return {
    async update(patch: { acceptingOrders?: boolean; openingHours?: unknown }) {
      record({ event: "settings-update-attempt", version });
      // A transport error can occur AFTER commit. Still attempt a guarded
      // restore; a changed/unknown revision must never be overwritten blindly.
      changed = true;
      const result = await db.query(`UPDATE public.restaurant_settings
        SET accepting_orders=COALESCE($1,accepting_orders),opening_hours=COALESCE($2::jsonb,opening_hours),
            updated_at=clock_timestamp()
        WHERE id=1 AND xmin::text=$3 RETURNING xmin::text AS version`,
      [patch.acceptingOrders ?? null, patch.openingHours === undefined ? null : JSON.stringify(patch.openingHours), version]);
      assert.equal(result.rowCount, 1, "Settings changed externally; refusing overwrite");
      version = result.rows[0].version;
      changed = true;
      record({ event: "settings-version", version });
    },
    async restore() {
      if (!changed) return;
      const result = await db.query(`UPDATE public.restaurant_settings
        SET accepting_orders=$1,opening_hours=$2::jsonb,updated_at=$3::timestamptz
        WHERE id=1 AND xmin::text=$4 RETURNING xmin::text AS version`,
      [original.accepting_orders, JSON.stringify(original.opening_hours), original.updated_at, version]);
      assert.equal(result.rowCount, 1, "Settings restoration conflict; preserve external changes and review journal");
      record({ event: "settings-restored" });
      changed = false;
    },
  };
}

export function failFastSteps(t: TestContext) {
  return async (name: string, body: () => Promise<void>) => {
    t.signal?.throwIfAborted();
    let failed = false;
    let bodyFailure: Error | undefined;
    let running: Promise<void> | undefined;
    try {
      await t.test(name, async () => {
        running = Promise.resolve().then(body);
        try { await running; } catch (error) { failed = true; bodyFailure = safeFailure(`test body: ${name}`, error); throw bodyFailure; }
      });
    } finally {
      // node:test cancellation can finish its bookkeeping before an async body
      // settles. Keep the suite work barrier closed until that body really ends.
      try { await running; } catch (error) { failed = true; bodyFailure ??= safeFailure(`test body: ${name}`, error); }
    }
    if (failed) throw new IntegrationFailure([bodyFailure!], "Integration step failed; later writes stopped");
  };
}

// One shared promise prevents timeout hooks and the body's finally from racing.
// A failed quiescence/resource barrier deliberately retains the lock session.
export function orderedTeardown(actions: {
  stopHttp: () => void;
  drainWork: () => Promise<void>;
  closeHttp: () => Promise<void>;
  restoreSettings: () => Promise<void>;
  closeApplication: () => Promise<void>;
  closeOther: () => Promise<void>;
  releaseLock: () => Promise<void>;
}) {
  let pending: Promise<void> | undefined;
  return () => pending ??= (async () => {
    const failures: Error[] = [];
    const attempt = async (stage: string, action: () => void | Promise<void>) => {
      try { await action(); return true; }
      catch (error) { failures.push(safeFailure(stage, error)); return false; }
    };
    const stopped = await attempt("stopHttp", actions.stopHttp);
    const drained = await attempt("drainWork", actions.drainWork);
    const httpClosed = await attempt("closeHttp", actions.closeHttp);
    if (stopped && drained && httpClosed) {
      await attempt("Settings restoration failed", actions.restoreSettings);
      const applicationClosed = await attempt("closeApplication", actions.closeApplication);
      const othersClosed = await attempt("closeOther", actions.closeOther);
      if (applicationClosed && othersClosed) await attempt("releaseLock", actions.releaseLock);
    }
    if (failures.length) throw new IntegrationFailure(failures, "Integration cleanup failed");
  })();
}

// Only trusted stage labels and allowlisted SQLSTATE categories cross the reporting
// boundary. Never retain raw causes, messages, stacks, URLs or query parameters.
export class IntegrationFailure extends AggregateError {
  constructor(errors: Error[], message: string) { super(errors, message); this.name = "IntegrationFailure"; }
}
export function safeFailure(stage: string, error: unknown): Error {
  if (error instanceof IntegrationFailure || error instanceof DataApiProbeError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  const allowed = new Set(["57014", "55P03", "25P03", "42501", "23505", "40P01", "40001"]);
  return new Error(`${stage}${typeof code === "string" && allowed.has(code) ? ` [SQLSTATE ${code}]` : ""}`);
}
export function reportFailures(primary: unknown[], cleanup: unknown[]) {
  if (!primary.length && !cleanup.length) return;
  const errors = [...primary.map((error) => safeFailure("test/setup failure", error)),
    ...cleanup.map((error) => safeFailure("cleanup failure", error))];
  throw new IntegrationFailure(errors, primary.length ? "Integration test/setup failed; primary failure first" : "Integration cleanup failed");
}
export async function closeResources(resources: [string, () => Promise<void>][]) {
  const errors: Error[] = [];
  for (const [stage, close] of resources) {
    try { await close(); } catch (error) { errors.push(safeFailure(stage, error)); }
  }
  if (errors.length) throw new IntegrationFailure(errors, "Resource cleanup failed");
}

export function dataApiDiagnostics(error: unknown): string[] {
  if (error instanceof DataApiProbeError) return [error.message];
  if (error instanceof IntegrationFailure) return error.errors.flatMap(dataApiDiagnostics);
  return [];
}

export class VerificationHttpError extends Error {
  constructor(readonly status: number) { super("Payment verification returned an unexpected HTTP status"); }
}

export type VerificationOutcome = { attempt: number; status: number | null; category: string };
export async function observeVerification(attempt: number, request: () => Promise<unknown>,
  record: (event: unknown) => void): Promise<VerificationOutcome> {
  record({ event: "verification-start", attempt });
  let outcome: VerificationOutcome;
  try {
    await request();
    outcome = { attempt, status: 200, category: "success" };
  } catch (error) {
    const status = error instanceof VerificationHttpError ? error.status : null;
    const categories: Record<number, string> = { 400: "validation", 401: "unauthenticated", 403: "forbidden",
      404: "not-found", 409: "conflict", 429: "rate-limit", 500: "server-error", 503: "unavailable" };
    const name = (error as { name?: unknown } | null)?.name;
    outcome = { attempt, status, category: status !== null ? categories[status] || "unexpected-http"
      : name === "TimeoutError" ? "timeout" : name === "AbortError" ? "aborted"
      : name === "TypeError" ? "network-or-client" : name === "SyntaxError" ? "invalid-json" : "unexpected-client-error" };
  }
  record({ event: "verification-outcome", ...outcome });
  return outcome;
}

export function requireIdempotentVerification(outcomes: VerificationOutcome[]) {
  if (outcomes.length !== 2 || outcomes.some((result) => result.status !== 200 || result.category !== "success")) {
    throw new IntegrationFailure(outcomes.map((result) => new Error(
      `Verification attempt ${result.attempt}: HTTP ${result.status ?? "unavailable"}; category=${result.category}`)),
    "Concurrent same-order verification requires two successful idempotent responses");
  }
}
