import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { createStagingApp } from "./stagingServer";

const configuration = { NODE_ENV: "production", STAGING_HEALTH_ONLY: "true" };

test("health-only mode requires opt-in and refuses credentials and feature flags without echoing values", () => {
  for (const flag of [undefined, "false", "TRUE", ""]) {
    assert.throws(() => createStagingApp({ ...configuration, STAGING_HEALTH_ONLY: flag }));
  }
  for (const key of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PGPASSWORD", "PGPASSFILE",
    "PGSERVICE", "PGHOST", "ADMIN_PASSWORD_HASH", "ADMIN_USERNAME", "ORDER_TRACKING_SECRET",
    "MERCHANT_UPI_ID", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
    assert.throws(() => createStagingApp({ ...configuration, [key]: "synthetic-private-value" }), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes("synthetic-private-value") && !error.message.includes(key));
      return true;
    });
  }
  for (const flags of [{ RAZORPAY_MODE: "test" }, { RAZORPAY_MODE: "live" }, { DEMO_PAYMENTS_ENABLED: "true" }, { SERVE_FRONTEND: "true" }]) {
    assert.throws(() => createStagingApp({ ...configuration, ...flags }));
  }
  assert.doesNotThrow(() => createStagingApp({ ...configuration, RAZORPAY_MODE: "off", DEMO_PAYMENTS_ENABLED: "false", SERVE_FRONTEND: "false" }));
});

test("only health/readiness are exposed; operational endpoints never accept requests", async () => {
  const server = createStagingApp(configuration).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.equal(health.headers.get("x-powered-by"), null);
    assert.equal(health.headers.get("cache-control"), "no-store");
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("set-cookie"), null);
    const ready = await fetch(`${base}/ready`);
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: "not_ready" });
    for (const path of ["/", "/menu", "/admin", "/order/fixture", "/.env", "/src/server.ts", "/api/health",
      "/api/db-health", "/api/menu", "/api/admin/auth/login", "/api/admin/orders", "/api/orders",
      "/api/orders/fixture/counter-payment", "/api/admin/orders/fixture/counter-payment",
      "/api/orders/fixture/demo-payment", "/api/orders/fixture/payment-claim", "/api/razorpay/webhook", "/health"]) {
      for (const method of path === "/health" ? ["POST", "PUT", "PATCH", "DELETE"] : ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
        const response = await fetch(`${base}${path}`, { method, headers: { Origin: "https://untrusted.invalid", Cookie: "synthetic=private" } });
        assert.equal(response.status, 404, `${method} ${path}`);
        assert.deepEqual(await response.json(), { message: "Not found." });
        assert.equal(response.headers.get("access-control-allow-origin"), null);
        assert.equal(response.headers.get("set-cookie"), null);
      }
    }
  } finally {
    await new Promise<void>((resolveClose, reject) => {
      server.close(error => error ? reject(error) : resolveClose());
      server.closeAllConnections();
    });
  }
});

test("compiled Render entry starts without DB/dotenv/workers, ignores a local .env and cannot open outgoing sockets", async () => {
  const entry = resolve(__dirname, "../dist/stagingServer.js");
  assert.ok(existsSync(entry), "Run npm run build before this test.");
  const directory = mkdtempSync(join(tmpdir(), "fr-health-only-"));
  const guard = join(directory, "guard.cjs");
  const dotenv = join(directory, ".env");
  // Synthetic only: a dotenv import would both trip the guard and provide forbidden config.
  writeFileSync(dotenv, "DATABASE_URL=postgres://synthetic:unused@127.0.0.1:1/forbidden\n");
  writeFileSync(guard, `
const Module=require('node:module');const load=Module._load;
Module._load=function(id,...args){if(/^(pg|dotenv)(\\/|$)|supabase|[\\/]db(?:\\.js)?$|paymentExpiry|razorpay|routes[\\/]|frontendHosting/.test(id))throw Error('Forbidden staging import');return load.call(this,id,...args);};
require('node:net').Socket.prototype.connect=function(){throw Error('Outgoing connection forbidden');};
global.setInterval=function(){throw Error('Background scheduling forbidden');};
`);
  // Use a parent-owned ephemeral listener to obtain a free local port, then close it.
  const portProbe = createStagingApp(configuration).listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const port = (portProbe.address() as { port: number }).port;
  await new Promise<void>(done => portProbe.close(() => done()));
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...configuration, PORT: String(port), RAZORPAY_MODE: "off", DEMO_PAYMENTS_ENABLED: "false", SERVE_FRONTEND: "false" };
  for (const key of Object.keys(childEnv)) {
    if (/^(DATABASE_|SUPABASE_|PG|ADMIN_|ORDER_TRACKING_SECRET|MERCHANT_UPI_|RAZORPAY_KEY|RAZORPAY_WEBHOOK|DOTENV_|NODE_OPTIONS)/.test(key)) delete childEnv[key];
  }
  const child = spawn(process.execPath, ["--require", guard, entry], { cwd: directory, env: childEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  let childError: Error | undefined;
  child.on("error", error => { childError = error; });
  const exited = once(child, "close");
  try {
    const deadline = Date.now() + 10000;
    while (!output.includes("Health-only staging listener started.") && Date.now() < deadline && child.exitCode === null && !childError) {
      await new Promise(done => setTimeout(done, 25));
    }
    assert.equal(childError, undefined);
    assert.ok(output.includes("Health-only staging listener started."), output);
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    const orders = await fetch(`http://127.0.0.1:${port}/api/orders`, { method: "POST" });
    assert.equal(orders.status, 404);
    assert.ok(!output.includes("Forbidden") && !output.includes("synthetic:unused"));
  } finally {
    if (child.exitCode === null) child.kill();
    await exited;
    unlinkSync(guard);
    unlinkSync(dotenv);
    rmdirSync(directory);
  }
});
