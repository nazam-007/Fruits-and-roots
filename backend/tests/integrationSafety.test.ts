import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolClient } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireWriteApproval, captureSettings, acquireRunLock, failFastSteps, inspectorConfig, orderedTeardown, IntegrationFailure, reportFailures, closeResources } from "./support/integrationSafety";
import type { TestContext } from "node:test";
import { buildDatabaseConfig } from "../src/databaseConfig";
import { integrationPreflight, timeoutDiagnostic } from "./support/integrationPreflight";
import { DataApiProbeError } from "./support/integrationDataApi";
import { dataApiDiagnostics } from "./support/integrationSafety";
import { WriteApprovalError } from "./support/integrationSafety";
import { safeFailure } from "./support/integrationSafety";
import { VerificationHttpError, observeVerification, requireIdempotentVerification } from "./support/integrationSafety";

test("canonical entry point requires both write approvals and exclusive access", () => {
  const approved = { INTEGRATION_ALLOW_WRITES: "I_ACKNOWLEDGE_DISPOSABLE_ONLY",
    INTEGRATION_APPROVED_PROJECT_REF: "wznkpgpexjexxzptuuwp",
    INTEGRATION_EXCLUSIVE_ACCESS_CONFIRMED: "NO_OTHER_APPLICATIONS_OR_TEST_RUNNERS" };
  requireWriteApproval(approved);
  for (const key of Object.keys(approved)) assert.throws(() => requireWriteApproval({ ...approved, [key]: "" }));
  assert.throws(() => requireWriteApproval({ ...approved, INTEGRATION_APPROVED_PROJECT_REF: "development" }));
  const scripts = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8")).scripts;
  assert.equal(scripts["test:integration"], "tsx tests/integrationRunner.ts run");
  assert.equal(scripts["test:integration:approved"], undefined);
  assert.ok(!scripts.test.includes("database.integration.test.ts"));
});

test("missing or mismatched write gates identify only their field name", () => {
  const approved = { INTEGRATION_ALLOW_WRITES: "I_ACKNOWLEDGE_DISPOSABLE_ONLY",
    INTEGRATION_APPROVED_PROJECT_REF: "wznkpgpexjexxzptuuwp",
    INTEGRATION_EXCLUSIVE_ACCESS_CONFIRMED: "NO_OTHER_APPLICATIONS_OR_TEST_RUNNERS" };
  for (const field of Object.keys(approved)) {
    for (const value of ["", "postgres://secret:password@private"]) {
      assert.throws(() => requireWriteApproval({ ...approved, [field]: value }), (error: unknown) => {
        assert.ok(error instanceof WriteApprovalError);
        assert.equal(error.message, `Write approval required: ${field} is missing or does not match its required value.`);
        assert.ok(!error.message.includes("secret"));
        return true;
      });
    }
  }
  const runner = readFileSync(resolve(__dirname, "integrationRunner.ts"), "utf8");
  assert.ok(runner.includes('stage = "write approval validation"'));
});

test("specific sanitized setup check survives primary failure aggregation", () => {
  const stage = "preflight / application row count: orders";
  const failure = new IntegrationFailure([safeFailure(stage, new Error("private connection parameters"))],
    `Integration failed at ${stage}`);
  assert.throws(() => reportFailures([failure], []), (error: unknown) => {
    assert.ok(error instanceof IntegrationFailure);
    assert.strictEqual(error.errors[0], failure);
    assert.equal(failure.errors[0].message, stage);
    assert.ok(!JSON.stringify(error.errors).includes("private connection parameters"));
    return true;
  });
});

test("concurrent verification preserves both HTTP failures without response bodies or secrets", async () => {
  const journal: unknown[] = [];
  const outcomes = await Promise.all([
    observeVerification(1, async () => { throw new VerificationHttpError(500); }, (event) => journal.push(event)),
    observeVerification(2, async () => { throw new VerificationHttpError(409); }, (event) => journal.push(event)),
  ]);
  assert.deepEqual(outcomes, [{ attempt: 1, status: 500, category: "server-error" },
    { attempt: 2, status: 409, category: "conflict" }]);
  assert.throws(() => requireIdempotentVerification(outcomes), (error: unknown) => {
    assert.ok(error instanceof IntegrationFailure);
    assert.equal(error.errors.length, 2);
    assert.ok(error.errors[0].message.includes("HTTP 500"));
    assert.ok(error.errors[1].message.includes("HTTP 409"));
    return true;
  });
  assert.equal(journal.length, 4);
});

test("concurrent verification diagnostics distinguish timeout, abort and client failure safely", async () => {
  for (const [name, category] of [["TimeoutError", "timeout"], ["AbortError", "aborted"],
    ["TypeError", "network-or-client"], ["SyntaxError", "invalid-json"], ["Error", "unexpected-client-error"]]) {
    const journal: unknown[] = [];
    const outcome = await observeVerification(1, async () => {
      const error = new Error("password token bank reference private"); error.name = name; throw error;
    }, (event) => journal.push(event));
    assert.deepEqual(outcome, { attempt: 1, status: null, category });
    assert.ok(!JSON.stringify(journal).includes("private"));
  }
});

test("two successful same-order verifications remain concurrent and accepted", async () => {
  let started = 0;
  let release!: () => void;
  const barrier = new Promise<void>((done) => { release = done; });
  const request = async () => { started++; await barrier; };
  const pending = Promise.all([observeVerification(1, request, () => undefined), observeVerification(2, request, () => undefined)]);
  assert.equal(started, 2);
  release();
  assert.throws(() => requireIdempotentVerification([]));
  const outcomes = await pending;
  assert.doesNotThrow(() => requireIdempotentVerification(outcomes));
});

test("inspector defaults to read-only transactions and verified TLS", () => {
  const config = inspectorConfig({}, "postgres://fixture:unused@testing.invalid/postgres");
  assert.equal(config.options, "-c default_transaction_read_only=on");
  assert.deepEqual(config.ssl, { rejectUnauthorized: true, minVersion: "TLSv1.2" });
});

function settingsDb() {
  let state = { accepting_orders: false, opening_hours: { monday: "original" }, updated_at: "2026-11-10 01:00:00.123456+00", version: "1" };
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("SELECT")) return { rows: [structuredClone(state)], rowCount: 1 };
    assert.ok(sql.includes("WHERE id=1 AND xmin::text="), "Every fixture update/restoration must use atomic revision guard");
    const restoring = values.length === 4;
    if (values.at(-1) !== state.version) return { rows: [], rowCount: 0 };
    state = { accepting_orders: values[0] === null ? state.accepting_orders : values[0] as boolean,
      opening_hours: values[1] === null ? state.opening_hours : JSON.parse(values[1] as string),
      updated_at: restoring ? values[2] as string : "changed", version: String(Number(state.version) + 1) };
    return { rows: [{ version: state.version }], rowCount: 1 };
  };
  return { db: { query } as unknown as Pick<Pool, "query">,
    state: () => structuredClone(state), external: () => { state.version = "99"; state.accepting_orders = true; } };
}

test("settings restore exact original values through assertion failure", async () => {
  const fake = settingsDb(); const original = fake.state(); const journal: unknown[] = [];
  const settings = await captureSettings(fake.db, (entry) => journal.push(entry));
  await assert.rejects(async () => {
    try {
      await settings.update({ acceptingOrders: true, openingHours: { monday: "fixture" } });
      throw new Error("synthetic assertion failure");
    } finally { await settings.restore(); }
  }, /synthetic assertion failure/);
  assert.deepEqual({ ...fake.state(), version: original.version }, original);
  assert.ok(journal.length >= 3);
});

test("settings mutation and restoration refuse external changes", async () => {
  const fake = settingsDb(); const settings = await captureSettings(fake.db, () => undefined);
  await settings.update({ acceptingOrders: true }); fake.external();
  const external = fake.state();
  await assert.rejects(settings.restore(), /restoration conflict/);
  await assert.rejects(settings.update({ acceptingOrders: false }), /changed externally/);
  assert.deepEqual(fake.state(), external);
});

test("settings capture refuses a missing singleton", async () => {
  await assert.rejects(captureSettings({ query: async () => ({ rows: [] }) } as unknown as Pick<Pool, "query">,
    () => undefined), /singleton missing/);
});

test("failed steps stop the caller before subsequent mutations", async () => {
  let laterWrite = false;
  const context = { test: async (_name: string, body: () => Promise<void>) => {
    try { await body(); } catch { /* emulate node:test recording subtest failure */ }
  } } as unknown as TestContext;
  const step = failFastSteps(context);
  await assert.rejects(async () => {
    await step("failure", async () => { throw new Error("fixture failure"); });
    await step("later mutation", async () => { laterWrite = true; });
  }, /later writes stopped/);
  assert.equal(laterWrite, false);
});

test("database session lock rejects overlap and releases only after ownership", async () => {
  const statements: string[] = [];
  let locked = true;
  const client = { connection: { stream: { encrypted: true, authorized: true, getProtocol: () => "TLSv1.3" } },
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes("pg_roles")) return { rows: [{ expected_role: true, rolcanlogin: true, rolinherit: false,
        rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false }] };
      return { rows: [{ acquired: !locked }] };
    } } as unknown as PoolClient;
  await assert.rejects(acquireRunLock(client), /Another integration run/);
  assert.ok(!statements.some((sql) => sql.includes("pg_advisory_unlock")));
  locked = false; const release = await acquireRunLock(client); await release();
  assert.ok(statements.at(-1)?.includes("pg_advisory_unlock"));
});

function teardownActions(events: string[]) {
  return {
    stopHttp: () => { events.push("stop"); },
    drainWork: async () => { events.push("work"); },
    closeHttp: async () => { events.push("http"); },
    restoreSettings: async () => { events.push("settings"); },
    closeApplication: async () => { events.push("database"); },
    closeOther: async () => { events.push("other"); },
    releaseLock: async () => { events.push("unlock"); },
  };
}

test("teardown drains HTTP and database resources before unlocking last", async () => {
  const events: string[] = [];
  await orderedTeardown(teardownActions(events))();
  assert.deepEqual(events, ["stop", "work", "http", "settings", "database", "other", "unlock"]);
});

test("timeout hook and body finally share teardown and await outstanding work", async () => {
  const events: string[] = [];
  let finish!: () => void;
  const work = new Promise<void>((done) => { finish = done; });
  const actions = teardownActions(events);
  actions.drainWork = async () => { events.push("work"); await work; };
  const shutdown = orderedTeardown(actions);
  const timeoutHook = shutdown();
  assert.strictEqual(shutdown(), timeoutHook);
  while (!events.includes("work")) await Promise.resolve();
  assert.deepEqual(events, ["stop", "work"]);
  finish(); await timeoutHook;
  assert.equal(events.filter((value) => value === "unlock").length, 1);
  assert.equal(events.at(-1), "unlock");
});

test("teardown retains lock while application database work drains", async () => {
  const events: string[] = [];
  let drained!: () => void;
  const pending = new Promise<void>((done) => { drained = done; });
  const actions = teardownActions(events);
  actions.closeApplication = async () => { events.push("database"); await pending; };
  const shutdown = orderedTeardown(actions)();
  while (!events.includes("database")) await Promise.resolve();
  assert.ok(!events.includes("unlock"));
  drained(); await shutdown;
  assert.equal(events.at(-1), "unlock");
});

test("quiescence and resource failures retain lock without unsafe retries", async () => {
  for (const stage of ["stopHttp", "drainWork", "closeHttp", "closeApplication", "closeOther"] as const) {
    const events: string[] = [];
    const actions = teardownActions(events);
    actions[stage] = () => { throw new Error("simulated failure"); };
    const shutdown = orderedTeardown(actions);
    const first = shutdown();
    await assert.rejects(first, /Integration cleanup failed/);
    assert.strictEqual(shutdown(), first);
    assert.ok(!events.includes("unlock"), stage);
  }
});

test("settings restoration failure drains resources, unlocks last and reports recovery", async () => {
  const events: string[] = [];
  const actions = teardownActions(events);
  actions.restoreSettings = async () => { events.push("settings"); throw new Error("revision conflict"); };
  await assert.rejects(orderedTeardown(actions)(), /Integration cleanup failed/);
  assert.deepEqual(events, ["stop", "work", "http", "settings", "database", "other", "unlock"]);
});

test("assertion failure runs the ordered finalizer", async () => {
  const events: string[] = [];
  const shutdown = orderedTeardown(teardownActions(events));
  await assert.rejects(async () => {
    try { throw new Error("assertion failure"); } finally { await shutdown(); }
  }, /assertion failure/);
  assert.equal(events.at(-1), "unlock");
});

test("aborted test context refuses later subtests before writes", async () => {
  const abort = new AbortController(); abort.abort();
  let ran = false;
  const context = { signal: abort.signal, test: async () => { ran = true; } } as unknown as TestContext;
  await assert.rejects(failFastSteps(context)("later write", async () => { ran = true; }));
  assert.equal(ran, false);
});

test("cancelled subtest bookkeeping cannot outpace its asynchronous body", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((done) => { finish = done; });
  let completed = false;
  const context = { test: async (_name: string, body: () => Promise<void>) => {
    void body().catch(() => undefined); // emulate early timeout bookkeeping
  } } as unknown as TestContext;
  const step = failFastSteps(context)("in flight", () => pending).then(() => { completed = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(completed, false);
  finish(); await step;
  assert.equal(completed, true);
});

test("unlock failure is reported once after all resource barriers", async () => {
  const events: string[] = [];
  const actions = teardownActions(events);
  actions.releaseLock = async () => { events.push("unlock"); throw new Error("lock connection failed"); };
  const shutdown = orderedTeardown(actions);
  const pending = shutdown();
  await assert.rejects(pending, /Integration cleanup failed/);
  assert.strictEqual(shutdown(), pending);
  assert.deepEqual(events, ["stop", "work", "http", "settings", "database", "other", "unlock"]);
});

function safeErrors(error: unknown): Error[] {
  return error instanceof AggregateError ? error.errors.flatMap(safeErrors) : [error as Error];
}
for (const [label, primary, cleanup] of [
  ["test failure with successful cleanup", [new Error("SECRET PRIMARY")], []],
  ["successful test with cleanup failure", [], [new Error("SECRET CLEANUP")]],
  ["simultaneous failures preserve primary first", [new Error("SECRET PRIMARY")], [new Error("SECRET CLEANUP")]],
] as const) {
  test(label, () => {
    assert.throws(() => reportFailures([...primary], [...cleanup]), (error: unknown) => {
      assert.ok(error instanceof IntegrationFailure);
      const messages = safeErrors(error).map((failure) => failure.message);
      assert.equal(messages[0], primary.length ? "test/setup failure" : "cleanup failure");
      assert.equal(messages.length, primary.length + cleanup.length);
      assert.ok(!JSON.stringify(error.errors).includes("SECRET"));
      assert.ok(!error.stack?.includes("SECRET"));
      return true;
    });
  });
}

test("multiple pool closure failures are retained without raw provider diagnostics", async () => {
  await assert.rejects(closeResources([
    ["inspector", async () => { throw new Error("postgres://secret:password@private"); }],
    ["preflight", async () => { throw new Error("token=secret"); }],
  ]), (error: unknown) => {
    assert.deepEqual(safeErrors(error).map((failure) => failure.message), ["inspector", "preflight"]);
    return true;
  });
});

test("restoration and application/inspector closure failures all survive; lock retained", async () => {
  const events: string[] = [];
  const actions = teardownActions(events);
  actions.restoreSettings = async () => { throw new Error("secret parameters"); };
  actions.closeApplication = async () => { throw new Error("secret database"); };
  actions.closeOther = async () => { throw new Error("secret inspector"); };
  await assert.rejects(orderedTeardown(actions)(), (error: unknown) => {
    assert.deepEqual(safeErrors(error).map((failure) => failure.message),
      ["Settings restoration failed", "closeApplication", "closeOther"]);
    assert.ok(!events.includes("unlock"));
    return true;
  });
});

test("successful execution and cleanup do not report a failure", () => {
  assert.doesNotThrow(() => reportFailures([], []));
});

test("integration limits cover restricted, inspector and application pool configuration", () => {
  const env = { DATABASE_URL: "postgres://fixture:unused@testing.invalid/postgres", NODE_ENV: "production",
    INTEGRATION_DATABASE_SAFETY_LIMITS: "enabled" };
  for (const config of [buildDatabaseConfig(env), inspectorConfig(env, env.DATABASE_URL)]) {
    assert.equal(config.connectionTimeoutMillis, 10000);
    assert.equal(config.statement_timeout, 12000);
    assert.equal(config.lock_timeout, 5000);
    assert.equal(config.idle_in_transaction_session_timeout, 10000);
    assert.equal(config.query_timeout, undefined, "Never mistake client timeout for server cancellation");
  }
  const normal = buildDatabaseConfig({ DATABASE_URL: env.DATABASE_URL });
  assert.equal(normal.statement_timeout, undefined);
  assert.throws(() => buildDatabaseConfig({ ...env, INTEGRATION_DATABASE_SAFETY_LIMITS: "disable" }));
});

test("preflight identifies connection refusal without including provider diagnostics", async () => {
  let stage = "";
  const pool = { connect: async () => { throw new Error("postgres://secret:password@private"); } } as unknown as Pool;
  await assert.rejects(integrationPreflight(pool, pool, "fixture", "session", "1", (check) => { stage = check; }));
  assert.equal(stage, "restricted connection: connect/authenticate/startup parameters");
  assert.ok(!stage.includes("secret"));
});

test("preflight identifies each effective timeout mismatch using static labels", async () => {
  for (const name of ["statement", "lock", "idle"]) {
    let stage = "";
    let released = false;
    const client = { connection: { stream: { encrypted: true, authorized: true, getProtocol: () => "TLSv1.3" } },
      query: async (sql: string) => ({ rows: sql.includes("current_setting")
        ? [{ statement: "12s", lock: "5s", idle: "10s", [name]: "0" }] : [] }),
      release: () => { released = true; } };
    const pool = { connect: async () => client } as unknown as Pool;
    await assert.rejects(integrationPreflight(pool, pool, "fixture", "session", "1", (check) => { stage = check; }));
    const expected = { statement: "12s", lock: "5s", idle: "10s" }[name];
    assert.equal(stage, `restricted connection: verify ${name} timeout (expected=${expected}, observed=0)`);
    assert.equal(released, true);
  }
});

test("timeout diagnostics expose only numeric duration values", () => {
  for (const value of ["0", "12s", "12000ms"]) assert.equal(timeoutDiagnostic(value), value);
  for (const value of ["postgres://secret", "token=private", "12s\nprivate", undefined]) {
    assert.equal(timeoutDiagnostic(value), "unrecognized");
  }
});

test("Data API diagnostics survive failure aggregation without exposing arbitrary errors", () => {
  let failure: unknown;
  try {
    reportFailures([new DataApiProbeError("authenticated-token", 401, "jwt-rejected")],
      [new Error("postgres://secret:password@private")]);
  } catch (error) { failure = error; }
  assert.deepEqual(dataApiDiagnostics(failure), ["Data API authenticated-token: HTTP 401; category=jwt-rejected"]);
  assert.deepEqual(dataApiDiagnostics(new Error("secret token")), []);
});
