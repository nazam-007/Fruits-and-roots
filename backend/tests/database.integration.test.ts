import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TestContext } from "node:test";
import { Pool } from "pg";
import { parse } from "dotenv";
import { buildDatabaseConfig } from "../src/databaseConfig";
import { createAdminPasswordHash } from "../src/adminPassword";
import { requireDisposableTarget } from "./support/integrationTarget";
import { integrationPreflight } from "./support/integrationPreflight";
import { verifyDataApiDenial } from "./support/integrationDataApi";
import { VerificationHttpError, observeVerification, requireIdempotentVerification } from "./support/integrationSafety";
import { requireWriteApproval, acquireRunLock, captureSettings, fixtureNumber, failFastSteps, inspectorConfig, orderedTeardown, closeResources, reportFailures, IntegrationFailure, safeFailure } from "./support/integrationSafety";

type Entity = { id: string; name: string };
type Order = { orderId: string; trackingToken: string; paymentStatus: string; orderStatus: string; totalAmount: number };

// No provisioning, migration execution, truncation or shared-DB fallback exists here.
export async function integrationSuite(t: TestContext) {
  requireWriteApproval(process.env);
  process.env.INTEGRATION_DATABASE_SAFETY_LIMITS = "enabled";
  let shared = process.env.SHARED_DATABASE_URL;
  try { shared = parse(readFileSync(resolve(__dirname, "../.env"))).DATABASE_URL || shared; }
  catch { /* CI must supply SHARED_DATABASE_URL if there is no local shared configuration. */ }
  if (!shared) throw new Error("A shared-target exclusion identity is required.");
  const target = requireDisposableTarget(process.env, shared);
  assert.notEqual(target.method, "local", "Only the pinned Supabase testing project is supported");
  const inspector = new Pool(inspectorConfig(process.env, target.inspectorUrl));
  let applicationDb: Pool | undefined;
  let server: import("node:http").Server | undefined;
  let settings: Awaited<ReturnType<typeof captureSettings>> | undefined;
  let stopping = false;
  let httpClosed: Promise<void> = Promise.resolve();
  let finishWork!: () => void;
  const workFinished = new Promise<void>((done) => { finishWork = done; });
  let lockClient: import("pg").PoolClient | undefined;
  let unlock: (() => Promise<void>) | undefined;
  const applicationProbe = new Pool(buildDatabaseConfig({ ...process.env,
    NODE_ENV: "production", DATABASE_TLS_MODE: "verify-full", DATABASE_URL: target.applicationUrl,
  }));
  const lockPool = new Pool({ ...buildDatabaseConfig({ ...process.env,
    NODE_ENV: "production", DATABASE_TLS_MODE: "verify-full", DATABASE_URL: target.applicationUrl,
  }), max: 1 });
  const shutdown = orderedTeardown({
    stopHttp: () => {
      stopping = true;
      if (server) {
        const activeServer = server;
        httpClosed = new Promise<void>((done, reject) => {
          // Stop listening first. Bound socket drainage (including SSE), but
          // never mistake socket closure for completion of server/database work.
          const timer = setTimeout(() => activeServer.closeAllConnections(), 5000);
          activeServer.close((error) => {
            clearTimeout(timer);
            if (error) reject(new Error("HTTP shutdown failed; lock retained")); else done();
          });
          activeServer.closeIdleConnections();
        });
        void httpClosed.catch(() => undefined);
      }
    },
    drainWork: () => workFinished,
    closeHttp: () => httpClosed,
    restoreSettings: async () => { await settings?.restore(); },
    closeApplication: async () => { await applicationDb?.end(); },
    closeOther: async () => { await closeResources([["inspector", () => inspector.end()], ["preflight pool", () => applicationProbe.end()]]); },
    releaseLock: async () => {
      // Only this dedicated session may unlock; never return it earlier.
      await unlock?.();
      lockClient?.release();
      await lockPool.end();
    },
  });
  // node:test may invoke this on timeout before the body finishes. Same promise,
  // safe diagnostics, and nonzero exit even when failure surfaces in the hook.
  t.after(shutdown);
  const primaryFailures: unknown[] = [];
  const cleanupFailures: unknown[] = [];
  let setupStage = "restricted lock connection";
  try {
  t.signal.throwIfAborted();
  lockClient = await lockPool.connect();
  let lockLost = false;
  lockClient.on("error", () => {
    lockLost = true;
    console.error("Integration lock connection lost; stopping process. Preserve fixtures for review.");
    process.exit(1);
  });
  setupStage = "advisory lock acquisition";
  unlock = await acquireRunLock(lockClient);
  {
    const preflight = await integrationPreflight(applicationProbe, inspector, process.env.INTEGRATION_RUN_ID!, target.method, process.env.INTEGRATION_TABLE_FIXTURE_ID,
      (check) => { setupStage = `preflight / ${check}`; });
    setupStage = "registered table fixture required";
    assert.equal(preflight.tableFixtureReady, true, "Provision the exact table fixture separately before writes");
    setupStage = "disposable marker required";
    assert.equal(preflight.markerReady, true, "Disposable marker must be provisioned separately before writes");
    setupStage = "Data API credential and denial checks";
    assert.equal((await verifyDataApiDenial(process.env)).configured, true,
      "Valid isolated anonymous key and authenticated token required before writes");
  }
  // A pre-provisioned marker is mandatory BEFORE any test writes or app startup.
  setupStage = "disposable marker recheck";
  const check = await inspector.connect();
  try {
    await check.query("BEGIN READ ONLY");
    const marker = await check.query(
      "SELECT run_id FROM fr_test_control.marker WHERE run_id = $1 AND disposable IS TRUE",
      [process.env.INTEGRATION_RUN_ID],
    );
    assert.equal(marker.rowCount, 1, "Missing disposable run marker; refusing writes.");
    await check.query("ROLLBACK");
  } finally { check.release(); }

  process.env.DATABASE_URL = target.applicationUrl;
  process.env.NODE_ENV = "production";
  process.env.DATABASE_TLS_MODE = "verify-full";
  process.env.FRONTEND_ORIGIN = "https://integration.invalid";
  // This loopback test server represents a trusted ingress and distinct fixture clients.
  process.env.TRUSTED_PROXY_IPS = "127.0.0.1";
  process.env.ADMIN_USERNAME = `integration-${process.env.INTEGRATION_RUN_ID}`;
  const password = randomUUID();
  process.env.ADMIN_PASSWORD_HASH = createAdminPasswordHash(password);
  process.env.ORDER_TRACKING_SECRET = randomUUID() + randomUUID();
  process.env.MERCHANT_UPI_ID = "fixture@invalid";
  process.env.MERCHANT_UPI_NAME = "Disposable Test Merchant";
  process.env.DEMO_PAYMENTS_ENABLED = "false";
  setupStage = "application pool import and role validation";
  const { db } = await import("../src/db.js");
  applicationDb = db;
  const role = (await db.query(`SELECT current_user = 'fruits_roots_backend' AS expected,
    rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`)).rows[0];
  assert.deepEqual(role, { expected: true, rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false });
  const permissions = (await db.query(`SELECT
    has_schema_privilege(current_user,'public','CREATE') AS schema_create,
    has_table_privilege(current_user,'public.orders','DELETE') AS order_delete,
    has_table_privilege(current_user,'public.admin_sessions','UPDATE') AS session_update,
    has_table_privilege(current_user,'public.admin_sessions','TRUNCATE') AS session_truncate`)).rows[0];
  assert.deepEqual(permissions, { schema_create: false, order_delete: false, session_update: false, session_truncate: false });
  setupStage = "HTTP application startup";
  const { app } = await import("../src/server.js");
  t.signal.throwIfAborted();
  // Test-only ingress guard; do not mutate production application middleware.
  const { createServer } = await import("node:http");
  server = createServer((request, response) => {
    if (stopping || t.signal.aborted) { response.writeHead(503); response.end(); return; }
    app(request, response);
  });
  server.listen(0, "127.0.0.1");
  const listeningServer = server;
  await new Promise<void>((done, reject) => {
    listeningServer.once("listening", done);
    listeningServer.once("error", reject);
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let cookie = "";
  let requestNumber = 0;
  async function call<T = Record<string, unknown>>(
    method: string, path: string, body?: unknown, expected = 200, token?: string,
  ): Promise<T> {
    t.signal.throwIfAborted();
    assert.equal(stopping, false, "Teardown started");
    assert.equal(lockLost, false, "Run lock lost");
    if (method !== "GET") record({ event: "request", method, path,
      ...(path === "/api/orders" ? { idempotencyKey: (body as { idempotencyKey: string }).idempotencyKey } : {}) });
    const response = await fetch(base + path, { method, signal: AbortSignal.any([t.signal, AbortSignal.timeout(15000)]), headers: {
      Origin: "https://integration.invalid", "Content-Type": "application/json",
      "X-Forwarded-For": `192.0.2.${++requestNumber % 250 + 1}`,
      ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (path.endsWith("/payment-verification")) {
      record({ event: "verification-http", status: response.status, expected });
      if (response.status !== expected) {
        try { await response.body?.cancel(); } catch { /* Preserve the observed HTTP failure. */ }
        throw new VerificationHttpError(response.status);
      }
    }
    assert.equal(response.status, expected, `${method} ${path} unexpected status`);
    if (path === "/api/admin/auth/login" && response.ok) cookie = response.headers.get("set-cookie")!.split(";")[0];
    const result = response.status === 204 ? undefined : await response.json();
    // Whitelist IDs only: never journal passwords, cookies, tracking/access tokens.
    if (result && (result.id || result.orderId)) record({ event: "response-id", method, path, id: result.id, orderId: result.orderId });
    return result as T;
  }
  const suffix = process.env.INTEGRATION_RUN_ID!;
  const artifacts = resolve(__dirname, "../integration-artifacts");
  mkdirSync(artifacts, { recursive: true });
  const journal = resolve(artifacts, `${suffix}.jsonl`);
  // Refuse run-ID replay rather than overwrite the original recovery evidence.
  setupStage = "exclusive recovery journal creation (existing journal refuses replay)";
  writeFileSync(journal, JSON.stringify({ event: "run", runId: suffix, tableFixtureId: process.env.INTEGRATION_TABLE_FIXTURE_ID }) + "\n", { flag: "wx", mode: 0o600 });
  const record = (value: unknown) => appendFileSync(journal, JSON.stringify(value) + "\n");
  setupStage = "original restaurant settings capture";
  settings = await captureSettings(db, record);
  const fixtureSettings = settings;
  const step = failFastSteps(t);
  let category: Entity;
  let tag: Entity;
  let product: Entity;
  let mainOrder: Order;
  const week = Object.fromEntries(["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]
    .map((day) => [day, { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" }]));
  const input = (name: string) => ({ name, description: "Synthetic fixture", category: category.name,
    image: null, availabilityStatus: "AVAILABLE", featured: false, tagIds: [tag.id], regularPrice: 120, largePrice: 180 });
  const createOrder = async () => call<Order>("POST", "/api/orders", {
    customerName: `Synthetic ${suffix}`, idempotencyKey: randomUUID(), totalAmount: 1,
    orderType: "TAKEAWAY", items: [{ productId: product.id, size: "Regular", quantity: 2, price: 1 }],
  }, 201);
  const claim = (order: Order) => call("POST", `/api/orders/${order.orderId}/payment-claim`,
    { transactionReference: `claim-${suffix}-${order.orderId}`, paymentStatus: "PAID" }, 200, order.trackingToken);
  const verify = (order: Order, reference: string, expected = 200) => call("POST",
    `/api/admin/orders/${order.orderId}/payment-verification`,
    { decision: "PAID", verifiedTransactionReference: reference }, expected);

  setupStage = "application scenario tests";
  await step("admin login, stored session and authorization", async () => {
    await call("GET", "/api/admin/auth/session", undefined, 401);
    await call("GET", "/api/admin/orders?status=ALL", undefined, 401);
    await call("POST", "/api/admin/orders/00000000-0000-4000-8000-000000000001/payment-verification",
      { decision: "PAID", verifiedTransactionReference: `unauthorized-${suffix}` }, 401);
    await call("POST", "/api/admin/auth/login", { username: process.env.ADMIN_USERNAME, password });
    assert.equal((await call("GET", "/api/admin/auth/session")).adminId, process.env.ADMIN_USERNAME);
    const validCookie = cookie;
    cookie = `${validCookie.split("=")[0]}=${"f".repeat(48)}`;
    try { await call("GET", "/api/admin/auth/session", undefined, 401); }
    finally { cookie = validCookie; }
  });
  await step("client roles cannot read sessions; write grants remain denied", async () => {
    for (const roleName of ["anon", "authenticated"]) {
      for (const sql of [
        "SELECT token_hash FROM public.admin_sessions LIMIT 0",
      ]) {
        const client = await inspector.connect();
        try {
          await client.query("BEGIN READ ONLY");
          await client.query(`SET LOCAL ROLE ${roleName}`); // fixed internal identifiers
          await assert.rejects(client.query(sql), (error: { code?: string }) => error.code === "42501");
        } finally { await client.query("ROLLBACK"); client.release(); }
      }
    }
  });
  await step("category/tag/product creation, edits and server menu retrieval", async () => {
    category = await call<Entity>("POST", "/api/admin/categories", { name: `Category ${suffix}` }, 201);
    tag = await call<Entity>("POST", "/api/admin/tags", { name: `Tag ${suffix}` }, 201);
    product = await call<Entity>("POST", "/api/admin/menu", input(`Product ${suffix}`), 201);
    category = await call<Entity>("PATCH", `/api/admin/categories/${category.id}`, { name: `Renamed ${suffix}` });
    await call("PATCH", `/api/admin/tags/${tag.id}`, { name: `Renamed tag ${suffix}` });
    await call("PATCH", `/api/admin/menu/${product.id}`, input(`Edited ${suffix}`));
    assert.ok((await call<Entity[]>("GET", "/api/menu")).some((item) => item.id === product.id));
  });
  await step("opening hours, closed days and manual pause persist", async () => {
    await fixtureSettings.update({ acceptingOrders: true, openingHours: week });
    assert.equal((await call("GET", "/api/menu/status")).status, "OPEN");
    await fixtureSettings.update({ acceptingOrders: false });
    assert.equal((await call("GET", "/api/menu/status")).status, "PAUSED");
    const closed = Object.fromEntries(Object.entries(week).map(([day, value]) => [day, { ...value, isOpen: false }]));
    await fixtureSettings.update({ acceptingOrders: true, openingHours: closed });
    assert.equal((await call("GET", "/api/menu/status")).status, "CLOSED");
    await fixtureSettings.update({ openingHours: week });
  });
  await step("checkout/pricing and pending operational isolation", async () => {
    const quote = await call("POST", "/api/orders/quote", { items: [{ productId: product.id, size: "Regular", quantity: 2 }] });
    assert.equal(quote.totalAmount, 240);
    mainOrder = await createOrder();
    assert.equal(mainOrder.totalAmount, 240);
    assert.equal(mainOrder.paymentStatus, "PENDING_PAYMENT");
    assert.equal(mainOrder.orderStatus, "PENDING_PAYMENT");
    const largeQuote = await call("POST", "/api/orders/quote", {
      items: [{ productId: product.id, size: "Large", quantity: 1 }],
    });
    assert.equal(largeQuote.totalAmount, 180);
    const list = await call<{ items: Entity[] }>("GET", "/api/admin/orders?status=ALL");
    assert.ok(!list.items.some((item) => item.id === mainOrder.orderId));
  });
  await step("cancellation preserves history and cannot place an attempt", async () => {
    const order = await createOrder();
    await call("POST", `/api/orders/${order.orderId}/payment-cancel`, undefined, 200, order.trackingToken);
    await call("POST", `/api/orders/${order.orderId}/payment-cancel`, undefined, 200, order.trackingToken);
    assert.equal((await call("GET", `/api/orders/${order.orderId}`, undefined, 200, order.trackingToken)).paymentStatus, "CANCELLED");
    const operational = await call<{ items: Entity[] }>("GET", "/api/admin/orders?status=ALL");
    assert.ok(!operational.items.some((item) => item.id === order.orderId));
  });
  await step("legacy registered table checkout retains its row-lock permission", async () => {
    const tableNumber = fixtureNumber(suffix);
    const order = await call<Order & { fulfillmentType: string }>("POST", "/api/orders", {
      customerName: `Synthetic table ${suffix}`, idempotencyKey: randomUUID(),
      fulfillmentType: "TABLE", tableNumber,
      items: [{ productId: product.id, size: "Regular", quantity: 1 }],
    }, 201);
    assert.equal(order.fulfillmentType, "TABLE");
    assert.equal(order.paymentStatus, "PENDING_PAYMENT");
  });
  await step("claim is not receipt proof; verification commits once concurrently", async () => {
    assert.equal((await claim(mainOrder)).paymentStatus, "PENDING_VERIFICATION");
    const pending = await call("GET", `/api/orders/${mainOrder.orderId}`, undefined, 200, mainOrder.trackingToken);
    assert.equal(pending.orderStatus, "PENDING_PAYMENT");
    const operational = await call<{ items: Entity[] }>("GET", "/api/admin/orders?status=ALL");
    assert.ok(!operational.items.some((item) => item.id === mainOrder.orderId));
    const ref = `confirmed-${suffix}`;
    const attempts = await Promise.all([
      observeVerification(1, () => verify(mainOrder, ref), record),
      observeVerification(2, () => verify(mainOrder, ref), record),
    ]);
    requireIdempotentVerification(attempts);
    await verify(mainOrder, `different-${suffix}`, 409);
    const paid = await call("GET", `/api/orders/${mainOrder.orderId}`, undefined, 200, mainOrder.trackingToken);
    assert.equal(paid.paymentStatus, "PAID"); assert.equal(paid.orderStatus, "PLACED");
    const rows = await db.query("SELECT count(*)::int AS count FROM payments WHERE order_id=$1 AND verified_transaction_reference=$2", [mainOrder.orderId, ref]);
    assert.equal(rows.rows[0].count, 1);
  });
  await step("expiry and late receipt remain reconciliation-only", async () => {
    const order = await createOrder(); await claim(order);
    await db.query("UPDATE orders SET payment_expires_at=now()-interval '1 second' WHERE id=$1", [order.orderId]);
    const { expirePendingPayments } = await import("../src/paymentExpiry.js");
    await expirePendingPayments();
    const result = await verify(order, `late-${suffix}`);
    assert.equal(result.reconciliationRequired, true);
    assert.equal(result.paymentStatus, "EXPIRED");
    assert.equal((await call("GET", `/api/orders/${order.orderId}`, undefined, 200, order.trackingToken)).orderStatus, "PENDING_PAYMENT");
    const operational = await call<{ items: Entity[] }>("GET", "/api/admin/orders?status=ALL");
    assert.ok(!operational.items.some((item) => item.id === order.orderId));
  });
  await step("one confirmed bank reference cannot pay two different orders concurrently", async () => {
    const first = await createOrder(); const second = await createOrder();
    await claim(first); await claim(second);
    // Raw statuses because either transaction is allowed to win.
    const outcomes = await Promise.allSettled([first, second].map((order) => fetch(
      `${base}/api/admin/orders/${order.orderId}/payment-verification`, { method: "POST",
        signal: AbortSignal.any([t.signal, AbortSignal.timeout(15000)]),
        headers: { Cookie: cookie, Origin: "https://integration.invalid", "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "PAID", verifiedTransactionReference: `unique-${suffix}` }),
      },
    )));
    assert.ok(outcomes.every((result) => result.status === "fulfilled"));
    const statuses = outcomes.map((result) => result.status === "fulfilled" ? result.value.status : 0);
    assert.deepEqual(statuses.sort(), [200, 409]);
  });
  await step("confirmed New Orders visibility and authorized customer tracking", async () => {
    const list = await call<{ items: Entity[] }>("GET", "/api/admin/orders?status=PLACED");
    assert.ok(list.items.some((item) => item.id === mainOrder.orderId));
    await call("GET", `/api/orders/${mainOrder.orderId}`, undefined, 404, "w".repeat(48));
    const response = await fetch(`${base}/api/orders/${mainOrder.orderId}/events`, {
      headers: { Authorization: `Bearer ${mainOrder.trackingToken}` }, signal: AbortSignal.any([t.signal, AbortSignal.timeout(5000)]),
    });
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    try {
      let stream = "";
      while (!stream.includes("PLACED")) {
        const chunk = await reader.read(); assert.equal(chunk.done, false);
        stream += new TextDecoder().decode(chunk.value);
      }
    } finally { await reader.cancel(); }
    for (const status of ["PREPARING", "READY", "COMPLETED"]) {
      await call("PATCH", `/api/admin/orders/${mainOrder.orderId}/status`, { status });
      assert.equal((await call("GET", `/api/orders/${mainOrder.orderId}`, undefined, 200, mainOrder.trackingToken)).orderStatus, status);
    }
  });
  await step("tag/product/category delete safety and logout", async () => {
    const unused = await call<Entity>("POST", "/api/admin/categories", { name: `Unused ${suffix}` }, 201);
    const unordered = await call<Entity>("POST", "/api/admin/menu", {
      ...input(`Unordered ${suffix}`), category: unused.name, tagIds: [],
    }, 201);
    assert.equal((await call("DELETE", `/api/admin/menu/${unordered.id}`)).deleted, true);
    await call("DELETE", `/api/admin/categories/${unused.id}`, undefined, 204);
    await call("DELETE", `/api/admin/tags/${tag.id}`, { confirmAssignedProducts: true }, 204);
    await call("DELETE", `/api/admin/menu/${product.id}`); // archives ordered product
    await call("DELETE", `/api/admin/categories/${category.id}`, undefined, 409);
    await call("POST", "/api/admin/auth/logout", undefined, 204);
    await call("GET", "/api/admin/auth/session", undefined, 401);
  });
  } catch (error) {
    primaryFailures.push(error instanceof IntegrationFailure ? error
      : new IntegrationFailure([safeFailure(setupStage, error)], `Integration failed at ${setupStage}`));
  }
  finally {
    finishWork();
    try { await shutdown(); } catch (error) { cleanupFailures.push(error); }
  }
  reportFailures(primaryFailures, cleanupFailures);
}

if (require.main === module) {
  throw new Error("Use npm run test:integration; direct suite execution is forbidden");
}
