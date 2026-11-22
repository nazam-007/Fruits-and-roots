import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { expiryWorker, gracefulShutdown } from "./serverLifecycle";
import type { Pool, PoolClient } from "pg";
import { buildRuntimeDatabaseConfig, runtimeDatabaseTarget, paymentExpiryWorkerEnabled,
  verifyDatabaseReadiness, startVerifiedRuntime } from "./productionStartup";

const env = { NODE_ENV: "production", DATABASE_URL: "postgres://fruits_roots_backend:synthetic@db.example.invalid/fixture",
  DATABASE_CA_CERT_PATH: "synthetic-ca" };
const refusal = "Restricted database startup verification failed.";
const grants = ["database_connect", "schema_usage", "no_creation", "table_permissions", "table_lock_permission",
  "sequence_permissions", "no_sequence_mutation", "no_financial_escalation", "no_column_escalation", "runtime_policies", "no_role_membership"];

function fixture() {
  const identity: Record<string, unknown> = { current_user: "fruits_roots_backend", session_user: "fruits_roots_backend",
    database: "fixture", read_only: "on", rolcanlogin: true, rolsuper: false, rolbypassrls: false,
    rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolinherit: false };
  const permissions: Record<string, unknown> = Object.fromEntries(grants.map(name => [name, true]));
  const sqls: string[] = [];
  const released: unknown[] = [];
  const socket = { encrypted: true, authorized: true, getPeerCertificate: () => ({ subjectaltname: "DNS:db.example.invalid" }) };
  const ssl = { ca: "synthetic-ca", rejectUnauthorized: true };
  const client = { ssl, connection: { stream: socket }, query: async (sql: string) => {
    sqls.push(sql);
    return { rows: sql.includes("runtime_permissions") ? [permissions] : sql.includes("SELECT current_user") ? [identity] : [] };
  }, release: (destroy: unknown) => { released.push(destroy); } };
  let connects = 0;
  const pool = { connect: async () => { connects++; return client as unknown as PoolClient; } } as unknown as Pick<Pool, "connect">;
  return { identity, permissions, sqls, released, socket, ssl, client, pool, connects: () => connects };
}

test("runtime configuration rejects missing URL, elevated/ambiguous users and insecure TLS before connecting", () => {
  for (const DATABASE_URL of [undefined, "not-a-url", "postgres://postgres:synthetic@db.example.invalid/fixture",
    "postgres://postgres.mrjsfznxbwjsdzyuzvsi:synthetic@db.example.invalid/postgres",
    "postgres://supabase_admin:synthetic@db.example.invalid/fixture",
    "postgres://fruits_roots_backend_admin:synthetic@db.example.invalid/fixture",
    "postgres://fruits_roots_backend:synthetic@db.example.invalid/"] ) {
    assert.throws(() => runtimeDatabaseTarget({ ...env, DATABASE_URL }), { message: refusal });
  }
  for (const extra of [{ DATABASE_CA_CERT_PATH: "" }, { DATABASE_TLS_MODE: "disable" }, { DATABASE_TLS_MODE: "require" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" }, { DATABASE_URL: `${env.DATABASE_URL}?sslmode=require` }]) {
    assert.throws(() => buildRuntimeDatabaseConfig({ ...env, ...extra }, () => "synthetic-ca"), { message: refusal });
  }
});

test("runtime pool requires supplied CA and accepts only restricted direct/pooler identities", () => {
  const config = buildRuntimeDatabaseConfig(env, () => "synthetic-ca");
  assert.deepEqual(config.ssl, { ca: "synthetic-ca", rejectUnauthorized: true, minVersion: "TLSv1.2" });
  assert.equal(config.statement_timeout, 15000);
  assert.equal(runtimeDatabaseTarget({ ...env, DATABASE_URL: "postgres://fruits_roots_backend.mrjsfznxbwjsdzyuzvsi:synthetic@db.example.invalid/postgres" }).database, "postgres");
  assert.throws(() => buildRuntimeDatabaseConfig(env, () => { throw Error("synthetic-private-error"); }), { message: refusal });
});

test("authentication failure is sanitized and never permits startup", async () => {
  const pool = { connect: async () => { throw Object.assign(Error("synthetic-private-password"), { code: "28P01" }); } } as unknown as Pick<Pool, "connect">;
  await assert.rejects(verifyDatabaseReadiness(pool, env), { message: refusal });
  const f = fixture();
  await assert.rejects(verifyDatabaseReadiness(f.pool, { ...env, DATABASE_URL: undefined }), { message: refusal });
  assert.equal(f.connects(), 0);
});

test("TLS chain, hostname, encryption and configured verification cannot be bypassed", async () => {
  for (const failure of ["chain", "hostname", "plaintext", "verification", "ca"]) {
    const f = fixture();
    if (failure === "chain") f.socket.authorized = false;
    if (failure === "hostname") f.socket.getPeerCertificate = () => ({ subjectaltname: "DNS:wrong.example.invalid" });
    if (failure === "plaintext") f.socket.encrypted = false;
    if (failure === "verification") f.ssl.rejectUnauthorized = false;
    if (failure === "ca") f.ssl.ca = "";
    await assert.rejects(verifyDatabaseReadiness(f.pool, env), { message: refusal });
    assert.deepEqual(f.sqls, []);
    assert.deepEqual(f.released, [true]);
  }
});

test("actual role/session/database identity and every elevated role attribute fail closed", async () => {
  for (const [key, value] of Object.entries({ current_user: "postgres", session_user: "postgres", database: "other",
    read_only: "off", rolcanlogin: false, rolsuper: true, rolbypassrls: true, rolcreatedb: true,
    rolcreaterole: true, rolreplication: true, rolinherit: true })) {
    const f = fixture(); f.identity[key] = value;
    await assert.rejects(verifyDatabaseReadiness(f.pool, env), { message: refusal });
    assert.equal(f.sqls.at(-1), "ROLLBACK"); assert.deepEqual(f.released, [true]);
  }
});

test("each required permission, RLS policy and membership result must explicitly pass", async () => {
  for (const name of grants) {
    const f = fixture(); f.permissions[name] = false;
    await assert.rejects(verifyDatabaseReadiness(f.pool, env), { message: refusal });
    assert.equal(f.sqls.at(-1), "ROLLBACK");
  }
  const f = fixture(); delete f.permissions.table_permissions;
  await assert.rejects(verifyDatabaseReadiness(f.pool, env), { message: refusal });
});

test("successful mocked restricted connection rolls back metadata-only inspection before release", async () => {
  const f = fixture(); await verifyDatabaseReadiness(f.pool, env);
  assert.equal(f.sqls[0], "BEGIN READ ONLY"); assert.equal(f.sqls.at(-1), "ROLLBACK");
  assert.deepEqual(f.released, [false]);
  const permissions = f.sqls.find(sql => sql.includes("runtime_permissions"))!;
  assert.match(permissions, /CROSS JOIN LATERAL unnest/);
  assert.match(permissions, /bool_and/);
  assert.match(permissions, /ANY\(p.polroles\)/);
  assert.doesNotMatch(f.sqls.join("\n"), /\b(?:INSERT INTO|UPDATE public|ALTER |GRANT |REVOKE |COMMIT)\b/i);
});

test("rollback failure cannot report readiness; failed connections are discarded", async () => {
  const f = fixture(), query = f.client.query;
  f.client.query = async sql => { if (sql === "ROLLBACK") throw Error("private"); return query(sql); };
  await assert.rejects(verifyDatabaseReadiness(f.pool, env), { message: refusal });
  assert.deepEqual(f.released, [true]);
});

test("listener and worker wait for successful readiness, including explicit worker opt-in", async () => {
  for (const workerEnabled of [false, true]) {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    const pending = startVerifiedRuntime({ verify: async () => { events.push("verify"); await gate; events.push("ready"); },
      listen: async () => { events.push("listen"); return "listener"; }, workerEnabled,
      startWorker: () => { events.push("worker"); }, cleanup: async () => { events.push("cleanup"); } });
    await Promise.resolve(); assert.deepEqual(events, ["verify"]);
    release(); assert.equal(await pending, "listener");
    assert.deepEqual(events, workerEnabled ? ["verify", "ready", "listen", "worker"] : ["verify", "ready", "listen"]);
  }
});

test("readiness/listener failures never start a worker or bypass verification", async () => {
  for (const failure of ["readiness", "listener"]) {
    const events: string[] = [];
    await assert.rejects(startVerifiedRuntime({ verify: async () => { if (failure === "readiness") throw Error("fail"); },
      listen: async () => { events.push("listen"); throw Error("bind failed"); }, workerEnabled: true,
      startWorker: () => { events.push("worker"); }, cleanup: async () => { events.push("cleanup"); } }));
    assert.deepEqual(events, failure === "readiness" ? ["cleanup"] : ["listen", "cleanup"]);
  }
});

for (const failure of ["sync", "async"] as const) {
  test(`${failure} worker startup failure closes real HTTP, drains worker and closes pool before rejecting`, async () => {
    const server = createServer((_req, res) => res.end("synthetic"));
    let worker: ReturnType<typeof expiryWorker> | undefined;
    let calls = 0, activeConnections = 0, poolCloses = 0, cleanupCalls = 0;
    let drain!: () => void;
    const activeRun = new Promise<void>(done => { drain = done; });
    let workerStop!: () => void;
    const stopping = new Promise<void>(done => { workerStop = done; });
    const shutdown = gracefulShutdown({
      stopHttp: async () => { await new Promise<void>((done, reject) => {
        server.close(error => error ? reject(error) : done()); server.closeAllConnections();
      }); },
      stopWorker: async () => { workerStop(); await worker?.stop(); },
      closePool: async () => { assert.equal(activeConnections, 0); poolCloses++; },
      forceClose: () => server.closeAllConnections(),
      fail: () => { assert.fail("Unexpected cleanup deadline"); }, report: () => {}, deadlineMs: 2000,
    });
    const pending = startVerifiedRuntime({
      verify: async () => {},
      listen: async () => { server.listen(0, "127.0.0.1"); await once(server, "listening"); return server; },
      workerEnabled: true,
      startWorker: () => {
        worker = expiryWorker(async () => { calls++; activeConnections++; try { await activeRun; } finally { activeConnections--; } }, () => {}, 10);
        if (failure === "sync") throw Error("synthetic-private-failure");
        return Promise.resolve().then(() => { throw Error("synthetic-private-failure"); });
      },
      cleanup: () => { cleanupCalls++; return shutdown(); },
    });
    const rejected = assert.rejects(pending, { message: "Backend startup failed." });
    try {
      await stopping;
      assert.equal(poolCloses, 0, "Pool must not close before worker drainage");
      drain();
      await rejected;
      assert.equal(server.listening, false);
      assert.equal(await new Promise<number>((done, reject) => server.getConnections((error, n) => error ? reject(error) : done(n))), 0);
      assert.equal(activeConnections, 0); assert.equal(poolCloses, 1); assert.equal(cleanupCalls, 1);
      const stoppedCalls = calls;
      await new Promise(done => setTimeout(done, 30));
      assert.equal(calls, stoppedCalls, "Failed startup must leave no worker timer running");
    } finally {
      drain(); await worker?.stop(); if (server.listening) server.close(); server.closeAllConnections();
    }
  });
}

test("asynchronous worker initialization is awaited and cleanup failures remain sanitized", async () => {
  let finish!: () => void, completed = false, cleaned = 0;
  const gate = new Promise<void>(done => { finish = done; });
  const pending = startVerifiedRuntime({ verify: async () => {}, listen: async () => "listener", workerEnabled: true,
    startWorker: () => gate, cleanup: async () => { cleaned++; } }).then(() => { completed = true; });
  await Promise.resolve(); await Promise.resolve(); assert.equal(completed, false);
  finish(); await pending; assert.equal(completed, true); assert.equal(cleaned, 0);
  await assert.rejects(startVerifiedRuntime({ verify: async () => {}, listen: async () => "listener", workerEnabled: true,
    startWorker: async () => { throw Error("synthetic-secret"); },
    cleanup: async () => { cleaned++; throw Error("synthetic-secret"); } }), { message: "Backend startup cleanup failed." });
  assert.equal(cleaned, 1);
});

test("worker defaults off in staging/production/development and enables only with exact true", () => {
  for (const NODE_ENV of ["staging", "production", "development", "test"]) {
    assert.equal(paymentExpiryWorkerEnabled({ NODE_ENV }), false);
    assert.equal(paymentExpiryWorkerEnabled({ NODE_ENV, PAYMENT_EXPIRY_WORKER_ENABLED: "false" }), false);
    assert.equal(paymentExpiryWorkerEnabled({ NODE_ENV, PAYMENT_EXPIRY_WORKER_ENABLED: "true" }), true);
  }
  for (const value of ["", "TRUE", "1", "yes"]) assert.throws(() => paymentExpiryWorkerEnabled({ PAYMENT_EXPIRY_WORKER_ENABLED: value }));
});

test("online expiry SQL excludes counter UNPAID orders and payment rows", () => {
  const sql = readFileSync(resolve(__dirname, "../src/paymentExpiry.ts"), "utf8");
  assert.match(sql, /WHERE payment_status IN \('PENDING_PAYMENT', 'PENDING_VERIFICATION'\)/);
  assert.match(sql, /AND p.payment_status IN \('PENDING_PAYMENT', 'PENDING_VERIFICATION'\)/);
  assert.ok(!sql.includes("'UNPAID'"));
});

test("compiled entry closes its bound listener and pool on sync/async worker failure and timer allocation failure", () => {
  const directory = mkdtempSync(join(tmpdir(), "fr-worker-failure-"));
  const guard = join(directory, "guard.cjs"), ca = join(directory, "ca.crt");
  writeFileSync(ca, "synthetic-ca");
  writeFileSync(guard, `
const Module=require('node:module'),load=Module._load;
const permissions=Object.fromEntries(${JSON.stringify(grants)}.map(k=>[k,true]));
class Pool {
 async connect(){return {ssl:{ca:'synthetic-ca',rejectUnauthorized:true},connection:{stream:{encrypted:true,authorized:true,getPeerCertificate:()=>({subjectaltname:'DNS:db.example.invalid'})}},
 async query(sql){if(sql.includes('runtime_permissions'))return {rows:[permissions]};if(sql.includes('SELECT current_user'))return {rows:[{current_user:'fruits_roots_backend',session_user:'fruits_roots_backend',database:'fixture',read_only:'on',rolcanlogin:true,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolinherit:false}]};if(sql==='BEGIN READ ONLY'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL'))return {rows:[]};console.log('APPLICATION_QUERY_FORBIDDEN');throw Error('Unexpected query');},release(){}};}
 async end(){console.log('POOL_CLOSED');}
}
Module._load=function(id,...args){if(id==='pg')return {Pool};
 if(id==='./paymentExpiry'&&process.env.FIXTURE_FAILURE!=='timer')return {getPendingPaymentExpiryMinutes:()=>30,startPendingPaymentExpiryWorker:()=>{if(process.env.FIXTURE_FAILURE==='async')return Promise.reject(Error('synthetic-private-worker-error'));throw Error('synthetic-private-worker-error');}};
 return load.call(this,id,...args);
};
const net=require('node:net'),listen=net.Server.prototype.listen;
net.Server.prototype.listen=function(...args){this.once('listening',()=>console.log('HTTP_BOUND'));this.once('close',()=>console.log('HTTP_CLOSED'));return listen.call(this,0,'127.0.0.1',args.at(-1));};
net.Socket.prototype.connect=function(){console.log('NETWORK_FORBIDDEN');throw Error('Unexpected connection');};
global.setInterval=function(){throw Error('synthetic-private-timer-error');};
`);
  try {
    for (const failure of ["sync", "async", "timer"]) {
      const run = spawnSync(process.execPath, ["--require", guard, resolve(__dirname, "../dist/server.js")], {
        cwd: directory, encoding: "utf8", windowsHide: true, timeout: 10000,
        env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, NODE_ENV: "production",
          FRONTEND_ORIGIN: "https://example.invalid", DATABASE_URL: env.DATABASE_URL, DATABASE_CA_CERT_PATH: ca,
          RAZORPAY_MODE: "off", DEMO_PAYMENTS_ENABLED: "false", SERVE_FRONTEND: "false",
          PAYMENT_EXPIRY_WORKER_ENABLED: "true", FIXTURE_FAILURE: failure },
      });
      assert.equal(run.error, undefined, failure);
      assert.equal(run.status, 1, failure);
      const output = run.stdout + run.stderr;
      assert.match(output, /HTTP_BOUND/); assert.match(output, /HTTP_CLOSED/);
      assert.equal(output.match(/POOL_CLOSED/g)?.length, 1);
      assert.doesNotMatch(output, /NETWORK_FORBIDDEN|APPLICATION_QUERY_FORBIDDEN|synthetic-private|backend running/);
    }
  } finally { unlinkSync(guard); unlinkSync(ca); rmdirSync(directory); }
});

test("compiled production entry refuses missing/elevated credentials, bad authentication and TLS before listening", () => {
  const directory = mkdtempSync(join(tmpdir(), "fr-startup-"));
  const guard = join(directory, "guard.cjs"), ca = join(directory, "ca.crt");
  writeFileSync(ca, "synthetic-ca");
  writeFileSync(guard, `
const Module=require('node:module'), load=Module._load;
class Pool { constructor(){} async connect(){if(process.env.FIXTURE_FAILURE==='auth')throw Error('synthetic-private-password');return {ssl:{ca:'synthetic-ca',rejectUnauthorized:true},connection:{stream:{encrypted:true,authorized:false}},release(){}};} async end(){console.log('POOL_CLOSED');} }
Module._load=function(id,...args){return id==='pg'?{Pool}:load.call(this,id,...args);};
require('node:net').Server.prototype.listen=function(){console.log('LISTEN_FORBIDDEN');throw Error('Unexpected listener');};
require('node:net').Socket.prototype.connect=function(){console.log('NETWORK_FORBIDDEN');throw Error('Unexpected connection');};
global.setInterval=function(){console.log('WORKER_FORBIDDEN');throw Error('Unexpected worker');};
`);
  try {
    for (const failure of ["missing", "elevated", "auth", "tls"]) {
      const childEnv: NodeJS.ProcessEnv = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH,
        NODE_ENV: "production", FRONTEND_ORIGIN: "https://example.invalid", DATABASE_CA_CERT_PATH: ca,
        RAZORPAY_MODE: "off", DEMO_PAYMENTS_ENABLED: "false", SERVE_FRONTEND: "false",
        PAYMENT_EXPIRY_WORKER_ENABLED: "true", FIXTURE_FAILURE: failure };
      if (failure !== "missing") childEnv.DATABASE_URL = failure === "elevated"
        ? "postgres://postgres:synthetic@db.example.invalid/fixture" : env.DATABASE_URL;
      const run = spawnSync(process.execPath, ["--require", guard, resolve(__dirname, "../dist/server.js")], {
        cwd: directory, env: childEnv, encoding: "utf8", windowsHide: true, timeout: 15000,
      });
      assert.equal(run.error, undefined);
      assert.equal(run.status, 1, failure);
      const output = run.stdout + run.stderr;
      assert.doesNotMatch(output, /LISTEN_FORBIDDEN|NETWORK_FORBIDDEN|WORKER_FORBIDDEN|synthetic-private-password|postgres:\/\//);
      if (["auth", "tls"].includes(failure)) assert.match(output, /POOL_CLOSED/);
    }
  } finally { unlinkSync(guard); unlinkSync(ca); rmdirSync(directory); }
});
