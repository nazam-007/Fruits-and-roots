import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { Pool } from "pg";
import { parse } from "dotenv";
import { buildDatabaseConfig } from "../src/databaseConfig";
import { createAdminPasswordHash } from "../src/adminPassword";
import { requireDisposableTarget } from "./support/integrationTarget";

type Entity = { id: string; name: string };
type Order = { orderId: string; trackingToken: string; paymentStatus: string; orderStatus: string; totalAmount: number };

// No provisioning, migration execution, truncation or shared-DB fallback exists here.
test("disposable database security and restaurant integration", {
  skip: !process.env.INTEGRATION_DATABASE_URL,
  timeout: 180_000,
}, async (t) => {
  let shared = process.env.SHARED_DATABASE_URL;
  try { shared = parse(readFileSync(resolve(__dirname, "../.env"))).DATABASE_URL || shared; }
  catch { /* CI must supply SHARED_DATABASE_URL if there is no local shared configuration. */ }
  if (!shared) throw new Error("A shared-target exclusion identity is required.");
  const target = requireDisposableTarget(process.env, shared);
  const inspector = new Pool(buildDatabaseConfig({ ...process.env,
    NODE_ENV: "production", DATABASE_TLS_MODE: "verify-full", DATABASE_URL: target.inspectorUrl,
  }));
  t.after(() => inspector.end());
  // A pre-provisioned marker is mandatory BEFORE any test writes or app startup.
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
  process.env.ADMIN_USERNAME = "isolated-integration-admin";
  const password = randomUUID();
  process.env.ADMIN_PASSWORD_HASH = createAdminPasswordHash(password);
  process.env.ORDER_TRACKING_SECRET = randomUUID() + randomUUID();
  process.env.MERCHANT_UPI_ID = "fixture@invalid";
  process.env.MERCHANT_UPI_NAME = "Disposable Test Merchant";
  process.env.DEMO_PAYMENTS_ENABLED = "false";
  const { db } = await import("../src/db.js");
  t.after(() => db.end());
  const role = (await db.query(`SELECT current_user = 'fruits_roots_backend' AS expected,
    rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`)).rows[0];
  assert.deepEqual(role, { expected: true, rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false });
  const permissions = (await db.query(`SELECT
    has_schema_privilege(current_user,'public','CREATE') AS schema_create,
    has_table_privilege(current_user,'public.orders','DELETE') AS order_delete,
    has_table_privilege(current_user,'public.admin_sessions','UPDATE') AS session_update,
    has_table_privilege(current_user,'public.admin_sessions','TRUNCATE') AS session_truncate`)).rows[0];
  assert.deepEqual(permissions, { schema_create: false, order_delete: false, session_update: false, session_truncate: false });
  const { app } = await import("../src/server.js");
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); }));
  await new Promise<void>((done) => server.once("listening", done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let cookie = "";
  let requestNumber = 0;
  async function call<T = Record<string, unknown>>(
    method: string, path: string, body?: unknown, expected = 200, token?: string,
  ): Promise<T> {
    const response = await fetch(base + path, { method, headers: {
      Origin: "https://integration.invalid", "Content-Type": "application/json",
      "X-Forwarded-For": `192.0.2.${++requestNumber % 250 + 1}`,
      ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, expected, `${method} ${path} unexpected status`);
    if (path === "/api/admin/auth/login" && response.ok) cookie = response.headers.get("set-cookie")!.split(";")[0];
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
  const suffix = randomUUID().slice(0, 8);
  let category: Entity;
  let tag: Entity;
  let product: Entity;
  let mainOrder: Order;
  const week = Object.fromEntries(["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]
    .map((day) => [day, { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" }]));
  const input = (name: string) => ({ name, description: "Synthetic fixture", category: category.name,
    image: null, availabilityStatus: "AVAILABLE", featured: false, tagIds: [tag.id], regularPrice: 120, largePrice: 180 });
  const createOrder = async () => call<Order>("POST", "/api/orders", {
    customerName: "Synthetic Customer", idempotencyKey: randomUUID(), totalAmount: 1,
    orderType: "TAKEAWAY", items: [{ productId: product.id, size: "Regular", quantity: 2, price: 1 }],
  }, 201);
  const claim = (order: Order) => call("POST", `/api/orders/${order.orderId}/payment-claim`,
    { transactionReference: `claim-${order.orderId}`, paymentStatus: "PAID" }, 200, order.trackingToken);
  const verify = (order: Order, reference: string, expected = 200) => call("POST",
    `/api/admin/orders/${order.orderId}/payment-verification`,
    { decision: "PAID", verifiedTransactionReference: reference }, expected);

  await t.test("admin login, stored session and authorization", async () => {
    await call("GET", "/api/admin/auth/session", undefined, 401);
    await call("POST", "/api/admin/auth/login", { username: process.env.ADMIN_USERNAME, password });
    assert.equal((await call("GET", "/api/admin/auth/session")).adminId, process.env.ADMIN_USERNAME);
  });
  await t.test("client roles cannot read/create/change/delete sessions", async () => {
    for (const roleName of ["anon", "authenticated"]) {
      for (const sql of [
        "SELECT token_hash FROM public.admin_sessions LIMIT 0",
        "INSERT INTO public.admin_sessions(token_hash,admin_id,expires_at) VALUES (repeat('0',64),'forbidden',now())",
        "UPDATE public.admin_sessions SET admin_id='forbidden' WHERE false",
        "DELETE FROM public.admin_sessions WHERE false",
      ]) {
        const client = await inspector.connect();
        try {
          await client.query("BEGIN");
          await client.query(`SET LOCAL ROLE ${roleName}`); // fixed internal identifiers
          await assert.rejects(client.query(sql), (error: { code?: string }) => error.code === "42501");
        } finally { await client.query("ROLLBACK"); client.release(); }
      }
    }
  });
  await t.test("category/tag/product creation, edits and server menu retrieval", async () => {
    category = await call<Entity>("POST", "/api/admin/categories", { name: `Category ${suffix}` }, 201);
    tag = await call<Entity>("POST", "/api/admin/tags", { name: `Tag ${suffix}` }, 201);
    product = await call<Entity>("POST", "/api/admin/menu", input(`Product ${suffix}`), 201);
    category = await call<Entity>("PATCH", `/api/admin/categories/${category.id}`, { name: `Renamed ${suffix}` });
    await call("PATCH", `/api/admin/tags/${tag.id}`, { name: `Renamed tag ${suffix}` });
    await call("PATCH", `/api/admin/menu/${product.id}`, input(`Edited ${suffix}`));
    assert.ok((await call<Entity[]>("GET", "/api/menu")).some((item) => item.id === product.id));
  });
  await t.test("opening hours, closed days and manual pause persist", async () => {
    await call("PATCH", "/api/admin/restaurant/settings", { acceptingOrders: true, openingHours: week });
    assert.equal((await call("GET", "/api/menu/status")).status, "OPEN");
    await call("PATCH", "/api/admin/restaurant/settings", { acceptingOrders: false });
    assert.equal((await call("GET", "/api/menu/status")).status, "PAUSED");
    const closed = Object.fromEntries(Object.entries(week).map(([day, value]) => [day, { ...value, isOpen: false }]));
    await call("PATCH", "/api/admin/restaurant/settings", { acceptingOrders: true, openingHours: closed });
    assert.equal((await call("GET", "/api/menu/status")).status, "CLOSED");
    await call("PATCH", "/api/admin/restaurant/settings", { openingHours: week });
  });
  await t.test("checkout/pricing and pending operational isolation", async () => {
    const quote = await call("POST", "/api/orders/quote", { items: [{ productId: product.id, size: "Regular", quantity: 2 }] });
    assert.equal(quote.totalAmount, 240);
    mainOrder = await createOrder();
    assert.equal(mainOrder.totalAmount, 240);
    assert.equal(mainOrder.paymentStatus, "PENDING_PAYMENT");
    const list = await call<{ items: Entity[] }>("GET", "/api/admin/orders?status=ALL");
    assert.ok(!list.items.some((item) => item.id === mainOrder.orderId));
  });
  await t.test("cancellation preserves history and cannot place an attempt", async () => {
    const order = await createOrder();
    await call("POST", `/api/orders/${order.orderId}/payment-cancel`, undefined, 200, order.trackingToken);
    await call("POST", `/api/orders/${order.orderId}/payment-cancel`, undefined, 200, order.trackingToken);
    assert.equal((await call("GET", `/api/orders/${order.orderId}`, undefined, 200, order.trackingToken)).paymentStatus, "CANCELLED");
  });
  await t.test("legacy registered table checkout retains its row-lock permission", async () => {
    const tableNumber = `T${suffix}`;
    await inspector.query("INSERT INTO restaurant_tables(table_number,is_active) VALUES($1,true)", [tableNumber]);
    const order = await call<Order & { fulfillmentType: string }>("POST", "/api/orders", {
      customerName: "Synthetic Table Customer", idempotencyKey: randomUUID(),
      fulfillmentType: "TABLE", tableNumber,
      items: [{ productId: product.id, size: "Regular", quantity: 1 }],
    }, 201);
    assert.equal(order.fulfillmentType, "TABLE");
    assert.equal(order.paymentStatus, "PENDING_PAYMENT");
  });
  await t.test("claim is not receipt proof; verification commits once concurrently", async () => {
    assert.equal((await claim(mainOrder)).paymentStatus, "PENDING_VERIFICATION");
    const ref = `confirmed-${suffix}`;
    await Promise.all([verify(mainOrder, ref), verify(mainOrder, ref)]);
    await verify(mainOrder, `different-${suffix}`, 409);
    const paid = await call("GET", `/api/orders/${mainOrder.orderId}`, undefined, 200, mainOrder.trackingToken);
    assert.equal(paid.paymentStatus, "PAID"); assert.equal(paid.orderStatus, "PLACED");
    const rows = await db.query("SELECT count(*)::int AS count FROM payments WHERE order_id=$1 AND verified_transaction_reference=$2", [mainOrder.orderId, ref]);
    assert.equal(rows.rows[0].count, 1);
  });
  await t.test("expiry and late receipt remain reconciliation-only", async () => {
    const order = await createOrder(); await claim(order);
    await db.query("UPDATE orders SET payment_expires_at=now()-interval '1 second' WHERE id=$1", [order.orderId]);
    const { expirePendingPayments } = await import("../src/paymentExpiry.js");
    await expirePendingPayments();
    const result = await verify(order, `late-${suffix}`);
    assert.equal(result.reconciliationRequired, true);
    assert.equal(result.paymentStatus, "EXPIRED");
    assert.equal((await call("GET", `/api/orders/${order.orderId}`, undefined, 200, order.trackingToken)).orderStatus, "PENDING_PAYMENT");
  });
  await t.test("one confirmed bank reference cannot pay two different orders concurrently", async () => {
    const first = await createOrder(); const second = await createOrder();
    await claim(first); await claim(second);
    // Raw statuses because either transaction is allowed to win.
    const results = await Promise.all([first, second].map((order) => fetch(
      `${base}/api/admin/orders/${order.orderId}/payment-verification`, { method: "POST",
        headers: { Cookie: cookie, Origin: "https://integration.invalid", "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "PAID", verifiedTransactionReference: `unique-${suffix}` }),
      },
    )));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  });
  await t.test("confirmed New Orders visibility and authorized customer tracking", async () => {
    const list = await call<{ items: Entity[] }>("GET", "/api/admin/orders?status=PLACED");
    assert.ok(list.items.some((item) => item.id === mainOrder.orderId));
    await call("GET", `/api/orders/${mainOrder.orderId}`, undefined, 404, "w".repeat(48));
    const response = await fetch(`${base}/api/orders/${mainOrder.orderId}/events`, {
      headers: { Authorization: `Bearer ${mainOrder.trackingToken}` }, signal: AbortSignal.timeout(5000),
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
  await t.test("tag/product/category delete safety and logout", async () => {
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
});
