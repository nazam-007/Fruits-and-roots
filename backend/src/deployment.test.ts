import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { EventEmitter } from "node:events";
import { frontendOrigins, trustedProxyIps, adminCookieSecurity, databaseHealthDiagnostic } from "./deploymentConfig";
import { mountFrontend } from "./frontendHosting";
import { expiryWorker, gracefulShutdown, registerShutdownSignals } from "./serverLifecycle";

test("production origins fail closed and admin cookies remain Strict/HttpOnly/Secure", () => {
  for (const origin of [undefined, "*", "http://cafe.example", "https://cafe.example/path", "https://user:password@cafe.example"]) {
    assert.throws(() => frontendOrigins({ NODE_ENV: "production", FRONTEND_ORIGIN: origin }));
  }
  assert.deepEqual(frontendOrigins({ NODE_ENV: "production", FRONTEND_ORIGIN: "https://cafe.example" }), ["https://cafe.example"]);
  assert.deepEqual(adminCookieSecurity({ NODE_ENV: "production" }), ["HttpOnly", "SameSite=Strict", "Secure"]);
  assert.deepEqual(adminCookieSecurity({ NODE_ENV: "development" }), ["HttpOnly", "SameSite=Strict"]);
});

test("explicit proxy trust ignores forged headers from untrusted peers and stops at the first untrusted hop", () => {
  for (const value of ["true", "1", "0.0.0.0/0", "::/0", "loopback", "192.0.2.1/33", "bad-address"]) {
    assert.throws(() => trustedProxyIps({ TRUSTED_PROXY_IPS: value }));
  }
  const app = express();
  app.set("trust proxy", trustedProxyIps({ TRUSTED_PROXY_IPS: "127.0.0.1/32" }));
  const ip = (peer: string, forwarded: string) => {
    const req = Object.create(app.request);
    req.app = app;
    req.headers = { "x-forwarded-for": forwarded };
    Object.defineProperty(req, "socket", { value: { remoteAddress: peer } });
    return req.ip;
  };
  assert.equal(ip("192.0.2.4", "127.0.0.1"), "192.0.2.4");
  assert.equal(ip("127.0.0.1", "203.0.113.99, 198.51.100.8"), "198.51.100.8");
});

test("database health diagnostics never serialize secrets, raw messages or hostile getters", () => {
  const secret = "postgres://private:password@host token=private";
  assert.deepEqual(databaseHealthDiagnostic({ code: "28P01", message: secret, detail: secret }),
    { stage: "database_health", category: "database", code: "28P01" });
  assert.equal(databaseHealthDiagnostic({ code: secret }).code, "unknown");
  assert.equal(databaseHealthDiagnostic({ get code() { throw Error(secret); } }).code, "unknown");
});

test("full SPA hosting keeps API routes, deep links and missing assets separate", async () => {
  const root = mkdtempSync(join(tmpdir(), "fr-hosting-test-"));
  const index = join(root, "index.html");
  writeFileSync(index, "<html>full application fixture</html>");
  const app = express();
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  mountFrontend(app, root, "true");
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  try {
    for (const path of ["/", "/menu", "/admin/login", "/admin/orders/fixture", "/order/fixture"]) {
      const page = await fetch(`${url}${path}`);
      assert.equal(page.status, 200, path);
      assert.equal(page.headers.get("cache-control"), "no-store", path);
      assert.match(await page.text(), /full application fixture/, path);
    }
    assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), { status: "ok" });
    const unknown = await fetch(`${url}/api/missing`);
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), { message: "API endpoint not found." });
    const asset = await fetch(`${url}/assets/missing.js`);
    assert.equal(asset.status, 404);
    await asset.text();
    const mutation = await fetch(`${url}/admin/orders`, { method: "POST" });
    assert.equal(mutation.status, 404);
    await mutation.text();
    assert.throws(() => mountFrontend(express(), root, "unexpected"));
    assert.throws(() => mountFrontend(express(), join(root, "missing"), "true"));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    unlinkSync(index);
    rmdirSync(root);
  }
});

test("API-only hosting preserves the homepage welcome response when disabled or unset", async () => {
  for (const mode of [undefined, "false"]) {
    const app = express();
    // Disabled hosting does not require or read a frontend build.
    mountFrontend(app, "unused-frontend-directory", mode);
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") || "", /application\/json/);
      assert.deepEqual(await response.json(), { message: "Welcome to Fruits & Roots API" });
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});

test("repeated SIGINT/SIGTERM retain handlers and share one shutdown until drainage completes", async () => {
  const signals = new EventEmitter();
  const calls: string[] = [];
  let drained!: () => void;
  const pendingDrain = new Promise<void>(resolve => { drained = resolve; });
  const shutdown = gracefulShutdown({
    stopHttp: async () => { calls.push("http"); await pendingDrain; },
    stopWorker: async () => { calls.push("worker"); await pendingDrain; },
    closePool: async () => { calls.push("pool"); },
    forceClose: () => assert.fail("Unexpected force close"), fail: () => assert.fail("Unexpected failure"),
    report: () => {},
  });
  const remove = registerShutdownSignals(shutdown, signals);
  try {
    for (const signal of ["SIGTERM", "SIGTERM", "SIGINT", "SIGINT", "SIGTERM"]) signals.emit(signal);
    await Promise.resolve();
    assert.deepEqual(calls, ["http", "worker"]);
    assert.equal(signals.listenerCount("SIGTERM"), 1);
    assert.equal(signals.listenerCount("SIGINT"), 1);
    drained();
    await shutdown();
    signals.emit("SIGINT");
    signals.emit("SIGTERM");
    assert.deepEqual(calls, ["http", "worker", "pool"]);
  } finally { drained(); remove(); await shutdown(); }
});

test("repeated signals preserve the failure deadline without duplicate failure handling", async () => {
  const signals = new EventEmitter();
  let failures = 0, forced = 0, pools = 0;
  const shutdown = gracefulShutdown({
    stopHttp: () => new Promise<void>(() => {}), stopWorker: async () => {},
    closePool: async () => { pools++; }, forceClose: () => { forced++; },
    fail: () => { failures++; }, report: () => {}, deadlineMs: 10,
  });
  const remove = registerShutdownSignals(shutdown, signals);
  try {
    signals.emit("SIGINT"); signals.emit("SIGINT"); signals.emit("SIGTERM");
    await assert.rejects(shutdown(), { message: "Server shutdown incomplete." });
    signals.emit("SIGTERM");
    await Promise.resolve();
    assert.equal(failures, 1);
    assert.equal(forced, 1);
    assert.equal(pools, 0);
    assert.equal(signals.listenerCount("SIGTERM"), 1);
  } finally { remove(); }
});

test("shutdown is shared, stops ingress/worker and waits for both before closing the pool", async () => {
  const calls: string[] = [];
  let httpDone!: () => void;
  let workerDone!: () => void;
  const http = new Promise<void>(resolve => { httpDone = resolve; });
  const worker = new Promise<void>(resolve => { workerDone = resolve; });
  const shutdown = gracefulShutdown({
    stopHttp: () => { calls.push("http"); return http; },
    stopWorker: () => { calls.push("worker"); return worker; },
    closePool: async () => { calls.push("pool"); }, forceClose: () => assert.fail("Unexpected force close"),
    fail: () => assert.fail("Unexpected failure"), report: () => {},
  });
  const pending = shutdown();
  assert.equal(shutdown(), pending);
  await Promise.resolve();
  assert.deepEqual(calls, ["http", "worker"]);
  httpDone();
  await delay(1);
  assert.equal(calls.includes("pool"), false);
  workerDone();
  await pending;
  assert.deepEqual(calls, ["http", "worker", "pool"]);
});

test("drain/pool failures and deadline report fixed stages and fail unsuccessfully", async () => {
  for (const scenario of ["drain", "pool", "deadline"]) {
    const stages: string[] = [];
    let poolCalls = 0, failures = 0, forced = 0;
    const shutdown = gracefulShutdown({
      stopHttp: () => scenario === "deadline" ? new Promise<void>(() => {})
        : scenario === "drain" ? Promise.reject(Error("sensitive provider failure")) : Promise.resolve(),
      stopWorker: async () => {},
      closePool: async () => { poolCalls++; if (scenario === "pool") throw Error("private connection string"); },
      forceClose: () => { forced++; }, fail: () => { failures++; },
      report: stage => { stages.push(stage); }, deadlineMs: 10,
    });
    await assert.rejects(shutdown(), { message: "Server shutdown incomplete." });
    assert.deepEqual(stages, [`shutdown_${scenario}`]);
    assert.equal(poolCalls, scenario === "pool" ? 1 : 0);
    assert.equal(failures, 1);
    assert.equal(forced, 1);
  }
});

test("expiry stop awaits the current operation and prevents overlap or new ticks", async () => {
  let complete!: () => void;
  let runs = 0;
  const current = new Promise<void>(resolve => { complete = resolve; });
  const worker = expiryWorker(async () => { runs++; await current; }, () => assert.fail("Worker failure"), 2);
  await delay(8);
  assert.equal(runs, 1);
  let stopped = false;
  const pending = worker.stop().then(() => { stopped = true; });
  await delay(5);
  assert.equal(stopped, false);
  complete();
  await pending;
  await delay(5);
  assert.equal(runs, 1);
});
