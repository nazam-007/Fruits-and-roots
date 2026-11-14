import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Pool, PoolClient, QueryResult } from "pg";
import { createAdminPasswordHash } from "./adminPassword";
import type { OpeningHours } from "./restaurantSchedule";

const longTestPassword = "p".repeat(64);
const openAllWeek: OpeningHours = {
  monday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  tuesday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  wednesday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  thursday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  friday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  saturday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  sunday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
};
process.env.DATABASE_URL = "postgres://security-test:security-test@127.0.0.1:5432/security_test";
process.env.FRONTEND_ORIGIN = "http://localhost:5173";
process.env.NODE_ENV = "test";
process.env.RAZORPAY_MODE = "off";
process.env.TRUSTED_PROXY_IPS = "";
process.env.ADMIN_USERNAME = "security-test";
process.env.ADMIN_PASSWORD_HASH = createAdminPasswordHash(longTestPassword);
process.env.MERCHANT_UPI_ID = "test-merchant@upi";
process.env.MERCHANT_UPI_NAME = "Test Merchant";
process.env.ORDER_TRACKING_SECRET = "t".repeat(32);

let server: Server;
let baseUrl: string;
let database: Pool;

test("checkout permits valid Razorpay test configuration without UPI and preserves manual payment gates", async (t) => {
  const { app } = await import("./server.js");
  const oldTrustProxy = app.get("trust proxy");
  app.set("trust proxy", ["loopback"]);
  let requestNumber = 0;
  const keys = ["MERCHANT_UPI_ID", "MERCHANT_UPI_NAME", "RAZORPAY_MODE", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "NODE_ENV", "ORDER_TRACKING_SECRET"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const oldConnect = database.connect;
  const oldQuery = database.query;
  const statements: string[] = [];
  const id = "00000000-0000-4000-8000-000000000291";
  const item = { product_id: "fixture-juice", product_name: "Fixture Juice", available: true, size: "Regular", price: 120 };
  const order = { id, order_number: "FR-FIXTURE", customer_name: "Synthetic", fulfillment_type: "PICKUP",
    order_type: "TAKEAWAY", table_number: null, total_amount: 120, payment_status: "PENDING_PAYMENT",
    payment_source: "MANUAL_UPI", order_status: "PENDING_PAYMENT", created_at: new Date(), items: [] };
  let accepting = true;
  const client = { query: async (sql: string) => {
    statements.push(sql);
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.includes("FROM orders WHERE idempotency_key")) return { rows: [] };
    if (sql.includes("FROM public.restaurant_settings")) return { rows: [{ accepting_orders: accepting, opening_hours: openAllWeek }] };
    if (sql.includes("FROM products p")) return { rows: [item] };
    if (sql.includes("INSERT INTO orders")) return { rows: [{ id }] };
    if (sql.includes("INSERT INTO order_items") || sql.includes("INSERT INTO payments")) return { rows: [] };
    throw Error("Unexpected fixture query");
  }, release: () => {} };
  database.connect = (async () => client) as unknown as Pool["connect"];
  database.query = (async () => ({ rows: [order] })) as unknown as Pool["query"];
  const submit = () => fetch(`${baseUrl}/api/orders`, { method: "POST", headers: {
    "Content-Type": "application/json", "X-Forwarded-For": `198.51.100.${++requestNumber}` },
    body: JSON.stringify({ customerName: "Synthetic", orderType: "TAKEAWAY", items: [{ productId: item.product_id, size: "Regular", quantity: 1 }],
      idempotencyKey: "00000000-0000-4000-8000-000000000292" }) });
  try {
    delete process.env.MERCHANT_UPI_ID;
    delete process.env.MERCHANT_UPI_NAME;
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_fixture";
    process.env.RAZORPAY_KEY_SECRET = "fixture-only";
    await t.test("test-only checkout remains pending with server prices", async () => {
      const response = await submit();
      assert.equal(response.status, 201);
      const result = await response.json();
      assert.equal(result.paymentStatus, "PENDING_PAYMENT");
      assert.equal(result.orderStatus, "PENDING_PAYMENT");
      assert.equal(result.totalAmount, 120);
      assert.equal(typeof result.trackingToken, "string");
      assert.ok(statements.some((sql) => sql.includes("'PENDING_PAYMENT', 'PENDING_PAYMENT'")));
      assert.ok(statements.some((sql) => sql.includes("INSERT INTO payments") && sql.includes("'PENDING_PAYMENT'")));
      assert.ok(statements.every((sql) => !sql.includes("'PAID'")));
      const config = await (await fetch(`${baseUrl}/api/payment-config`)).json();
      assert.equal(config.configured, false); // Still describes manual UPI only.
      assert.equal(config.razorpayTestEnabled, true);
      assert.equal(config.upiId, undefined);
    });
    await t.test("restaurant pause remains enforced without UPI", async () => {
      accepting = false;
      const response = await submit();
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, "ORDERS_PAUSED");
      accepting = true;
    });
    await t.test("secure tracking remains required", async () => {
      process.env.ORDER_TRACKING_SECRET = "";
      const before = statements.length;
      const response = await submit();
      assert.equal(response.status, 503);
      assert.equal((await response.json()).message, "Secure order tracking is not configured.");
      assert.equal(statements.length, before);
      process.env.ORDER_TRACKING_SECRET = saved.ORDER_TRACKING_SECRET;
    });
    await t.test("manual-only mode still requires UPI", async () => {
      process.env.RAZORPAY_MODE = "off";
      const before = statements.length;
      const response = await submit();
      assert.equal(response.status, 503);
      assert.equal((await response.json()).message, "UPI payment is not configured.");
      assert.equal(statements.length, before);
    });
    await t.test("production cannot use test mode to bypass missing UPI", async () => {
      process.env.RAZORPAY_MODE = "test";
      process.env.NODE_ENV = "production";
      const before = statements.length;
      assert.equal((await submit()).status, 503);
      assert.equal(statements.length, before);
      process.env.NODE_ENV = "test";
    });
    await t.test("configured manual checkout remains supported", async () => {
      process.env.RAZORPAY_MODE = "off";
      process.env.MERCHANT_UPI_ID = saved.MERCHANT_UPI_ID;
      process.env.MERCHANT_UPI_NAME = saved.MERCHANT_UPI_NAME;
      assert.equal((await submit()).status, 201);
    });
  } finally {
    app.set("trust proxy", oldTrustProxy);
    database.connect = oldConnect;
    database.query = oldQuery;
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});

test("Razorpay failure diagnostics preserve HTTP responses without database or provider access", async () => {
  const oldConnect = database.connect;
  const oldError = console.error;
  const saved = { mode: process.env.RAZORPAY_MODE, key: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
  const lines: string[] = [];
  process.env.RAZORPAY_MODE = "test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_fixture";
  process.env.RAZORPAY_KEY_SECRET = "fixture-only";
  console.error = (line: string) => { lines.push(line); };
  try {
    for (const [code, status, message] of [
      ["42703", 503, "Razorpay testing schema is not ready; review migration 016"],
      ["23514", 503, "Razorpay testing schema is not ready; review migration 016"],
      ["23505", 409, "Payment identity already recorded"],
      ["42501", 503, "Unable to process Razorpay test payment; retry safely"],
      ["private-code", 503, "Unable to process Razorpay test payment; retry safely"],
    ] as const) {
      database.connect = (async () => { throw { code, message: "private-data", constraint: "payments_source_check" }; }) as unknown as Pool["connect"];
      const response = await fetch(`${baseUrl}/api/orders/00000000-0000-4000-8000-000000000201/razorpay/order`, {
        method: "POST", headers: { Authorization: `Bearer ${"t".repeat(48)}` },
      });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { message });
      assert.equal(JSON.parse(lines.at(-1)!).stage, "razorpay_database_transaction");
    }
    console.error = () => { throw Error("logger unavailable"); };
    const response = await fetch(`${baseUrl}/api/orders/00000000-0000-4000-8000-000000000201/razorpay/order`, {
      method: "POST", headers: { Authorization: `Bearer ${"t".repeat(48)}` },
    });
    assert.equal(response.status, 503);
    assert.equal(lines.join("").includes("private-data"), false);
    assert.equal(lines.join("").includes("private-code"), false);
  } finally {
    database.connect = oldConnect;
    console.error = oldError;
    for (const [name, value] of Object.entries({ RAZORPAY_MODE: saved.mode, RAZORPAY_KEY_ID: saved.key, RAZORPAY_KEY_SECRET: saved.secret })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

before(async () => {
  const [{ app }, { db }] = await Promise.all([
    import("./server.js"),
    import("./db.js"),
  ]);
  database = db;
  server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("unauthenticated admin APIs and image uploads are rejected", async (t) => {
  for (const [name, path, method] of [
    ["dashboard", "/api/admin/dashboard", "GET"],
    ["restaurant settings", "/api/admin/restaurant/settings", "GET"],
    ["restaurant settings update", "/api/admin/restaurant/settings", "PATCH"],
    ["order list", "/api/admin/orders?page=1&limit=15", "GET"],
    ["payment verification queue", "/api/admin/payment-claims", "GET"],
    ["payment reconciliation queue", "/api/admin/payment-reconciliation", "GET"],
    ["order status update", "/api/admin/orders/00000000-0000-4000-8000-000000000001/status", "PATCH"],
    ["payment verification", "/api/admin/orders/00000000-0000-4000-8000-000000000001/payment-verification", "POST"],
    ["product tag list", "/api/admin/tags", "GET"],
    ["product tag creation", "/api/admin/tags", "POST"],
    ["product tag rename", "/api/admin/tags/00000000-0000-4000-8000-000000000001", "PATCH"],
    ["product tag deletion", "/api/admin/tags/00000000-0000-4000-8000-000000000001", "DELETE"],
    ["category list", "/api/admin/categories", "GET"],
    ["category creation", "/api/admin/categories", "POST"],
    ["category rename", "/api/admin/categories/00000000-0000-4000-8000-000000000001", "PATCH"],
    ["category reorder", "/api/admin/categories/order", "PUT"],
    ["category deletion", "/api/admin/categories/00000000-0000-4000-8000-000000000001", "DELETE"],
    ["product price change", "/api/admin/menu/test-product", "PATCH"],
    ["product deletion", "/api/admin/menu/test-product", "DELETE"],
    ["menu image upload", "/api/admin/menu/test-product/image", "POST"],
  ] as const) {
    await t.test(name, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401);
    });
  }
});

test("Razorpay webhook validates exact raw bytes and production endpoints stay disabled", async () => {
  const names = ["NODE_ENV", "RAZORPAY_MODE", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.NODE_ENV = "test";
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_fixture";
    process.env.RAZORPAY_KEY_SECRET = "fixture-secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook-fixture";
    const raw = '{ "event": "unsupported.fixture" }';
    const signature = createHmac("sha256", "webhook-fixture").update(raw).digest("hex");
    const send = (body: string, value: string) => fetch(`${baseUrl}/api/razorpay/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": value }, body,
    });
    assert.equal((await send(raw, "0".repeat(64))).status, 400);
    assert.equal((await send(JSON.stringify(JSON.parse(raw)), signature)).status, 400);
    const valid = await send(raw, signature);
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).ignored, true);
    process.env.NODE_ENV = "production";
    assert.equal((await send(raw, signature)).status, 404);
    for (const endpoint of ["order", "verify"]) {
      const response = await fetch(`${baseUrl}/api/orders/00000000-0000-4000-8000-000000000201/razorpay/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      assert.equal(response.status, 404);
    }
  } finally {
    for (const name of names) { if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name]; }
  }
});

test("public catalog change stream supports Server-Sent Events", async () => {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/menu/events`, {
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  controller.abort();
});

test("order creation respects restaurant ordering state", async () => {
  const originalConnect = database.connect.bind(database);
  const originalQuery = database.query.bind(database);
  const orderId = "00000000-0000-4000-8000-000000000099";
  const productId = "test-menu-item";
  let acceptingOrders = false;
  let openingHours = openAllWeek;
  let updatedAt = "2026-11-07T00:00:00.000Z";
  const statements: string[] = [];
  let insertedOrderValues: unknown[] | undefined;

  const mockedClient = {
    query: async (sql: string, values?: unknown[]) => {
      statements.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM orders WHERE idempotency_key")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM public.restaurant_settings")) {
        return {
          rows: [{
            accepting_orders: acceptingOrders,
            opening_hours: openingHours,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM products p")) {
        return {
          rows: [{
            product_id: productId,
            product_name: "Test Juice",
            available: true,
            size: "Regular",
            price: 120,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("INSERT INTO orders")) {
        insertedOrderValues = values;
        return { rows: [{ id: orderId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release: () => undefined,
  } as unknown as PoolClient;

  Object.defineProperty(database, "connect", {
    configurable: true,
    value: async () => mockedClient,
  });
  Object.defineProperty(database, "query", {
    configurable: true,
    value: async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM admin_sessions")) {
        return { rows: [{ admin_id: "test-admin" }], rowCount: 1 };
      }
      if (sql.includes("FROM public.restaurant_settings")) {
        return {
          rows: [{ acceptingOrders, openingHours, updatedAt }],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE public.restaurant_settings")) {
        if (values?.[0] !== null) acceptingOrders = values?.[0] === true;
        if (values?.[1]) openingHours = JSON.parse(String(values[1])) as OpeningHours;
        updatedAt = "2026-11-07T00:00:01.000Z";
        return {
          rows: [{ acceptingOrders, openingHours, updatedAt }],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM orders o") && sql.includes("WHERE o.id = $1")) {
        return {
          rows: [{
            id: orderId,
            order_number: "FR-TEST-0001",
            customer_name: "Test Customer",
            fulfillment_type: "PICKUP",
            order_type: "TAKEAWAY",
            table_number: null,
            total_amount: 120,
            payment_status: "PENDING_PAYMENT",
            payment_expires_at: new Date(Date.now() + 30 * 60_000),
            payment_source: "MANUAL_UPI",
            order_status: "PENDING_PAYMENT",
            created_at: new Date(),
            items: [{
              productId,
              productName: "Test Juice",
              size: "Regular",
              quantity: 1,
              unitPrice: 120,
            }],
          }],
          rowCount: 1,
        } as unknown as QueryResult;
      }
      return originalQuery(sql, values as never);
    },
  });

  try {
    const publicStatusResponse = await fetch(`${baseUrl}/api/menu/status`);
    assert.equal(publicStatusResponse.status, 200);
    assert.equal((await publicStatusResponse.json()).acceptingOrders, false);

    const adminCookie = `fr_admin_session=${"a".repeat(48)}`;
    const initialSettingsResponse = await fetch(
      `${baseUrl}/api/admin/restaurant/settings`,
      { headers: { Cookie: adminCookie } },
    );
    const initialSettings = await initialSettingsResponse.json();
    assert.equal(initialSettingsResponse.status, 200);
    assert.equal(initialSettings.acceptingOrders, false);
    assert.deepEqual(initialSettings.openingHours, openAllWeek);

    const updateSettingsResponse = await fetch(
      `${baseUrl}/api/admin/restaurant/settings`,
      {
        method: "PATCH",
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ acceptingOrders: true }),
      },
    );
    const updatedSettings = await updateSettingsResponse.json();
    assert.equal(updateSettingsResponse.status, 200);
    assert.equal(updatedSettings.acceptingOrders, true);
    assert.notEqual(updatedSettings.updatedAt, initialSettings.updatedAt);

    const closedSchedule = Object.fromEntries(
      Object.entries(openAllWeek).map(([weekday, day]) => [
        weekday,
        { ...day, isOpen: false },
      ]),
    );
    const scheduleUpdateResponse = await fetch(
      `${baseUrl}/api/admin/restaurant/settings`,
      {
        method: "PATCH",
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ openingHours: closedSchedule }),
      },
    );
    assert.equal(scheduleUpdateResponse.status, 200);
    assert.equal((await scheduleUpdateResponse.json()).openingHours.monday.isOpen, false);
    assert.equal(acceptingOrders, true);

    const overlappingSchedule = {
      ...closedSchedule,
      monday: {
        isOpen: true,
        allDay: false,
        opensAt: "18:00",
        closesAt: "02:00",
      },
      tuesday: {
        isOpen: true,
        allDay: false,
        opensAt: "01:00",
        closesAt: "05:00",
      },
    };
    const invalidScheduleResponse = await fetch(
      `${baseUrl}/api/admin/restaurant/settings`,
      {
        method: "PATCH",
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ openingHours: overlappingSchedule }),
      },
    );
    assert.equal(invalidScheduleResponse.status, 400);
    assert.deepEqual(openingHours, closedSchedule);

    const closedResponse = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Test Customer",
        orderType: "TAKEAWAY",
        items: [{ productId, size: "Regular", quantity: 1 }],
        idempotencyKey: "00000000-0000-4000-8000-000000000093",
      }),
    });
    assert.equal(closedResponse.status, 409);
    assert.equal((await closedResponse.json()).code, "RESTAURANT_CLOSED");

    const reopenResponse = await fetch(
      `${baseUrl}/api/admin/restaurant/settings`,
      {
        method: "PATCH",
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ openingHours: openAllWeek }),
      },
    );
    const reopenedSettings = await reopenResponse.json();
    assert.equal(reopenResponse.status, 200);
    assert.equal(reopenedSettings.orderingAvailable, true);
    assert.equal(acceptingOrders, true);

    acceptingOrders = false;
    const pausedResponse = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Test Customer",
        orderType: "TAKEAWAY",
        items: [{ productId, size: "Regular", quantity: 1 }],
        idempotencyKey: "00000000-0000-4000-8000-000000000091",
      }),
    });
    assert.equal(pausedResponse.status, 409);
    assert.equal((await pausedResponse.json()).code, "ORDERS_PAUSED");
    assert.ok(statements.some((sql) => sql.includes("FOR SHARE")));
    assert.ok(!statements.some((sql) => sql.includes("INSERT INTO orders")));

    openingHours = openAllWeek;
    acceptingOrders = true;
    statements.length = 0;
    const acceptingResponse = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Test Customer",
        orderType: "TAKEAWAY",
        items: [{ productId, size: "Regular", quantity: 1 }],
        idempotencyKey: "00000000-0000-4000-8000-000000000092",
      }),
    });
    assert.equal(acceptingResponse.status, 201);
    const pendingOrder = await acceptingResponse.json();
    assert.equal(pendingOrder.orderId, orderId);
    assert.equal(pendingOrder.paymentStatus, "PENDING_PAYMENT");
    assert.equal(pendingOrder.orderStatus, "PENDING_PAYMENT");
    assert.ok(statements.some((sql) => sql.includes("INSERT INTO orders")));
    assert.ok(
      statements.some(
        (sql) =>
          sql.includes("'PENDING_PAYMENT', 'PENDING_PAYMENT'") &&
          sql.includes("payment_expires_at"),
      ),
    );
    assert.equal(insertedOrderValues?.[10], 30);
  } finally {
    Object.defineProperty(database, "connect", {
      configurable: true,
      value: originalConnect,
    });
    Object.defineProperty(database, "query", {
      configurable: true,
      value: originalQuery,
    });
  }
});

test("admin orders and dashboard count only paid operational orders", async () => {
  const originalQuery = database.query.bind(database);
  const statements: string[] = [];
  const operationalOrder = {
    id: "00000000-0000-4000-8000-000000000101",
    order_number: "FR-00000101",
    customer_name: "Paid Customer",
    customer_phone: null,
    fulfillment_type: "PICKUP",
    order_type: "TAKEAWAY",
    table_number: null,
    total_amount: 120,
    payment_status: "PAID",
    order_status: "PLACED",
    created_at: new Date().toISOString(),
    payment_source: "MANUAL_UPI",
  };
  Object.defineProperty(database, "query", {
    configurable: true,
    value: async (sql: string, values?: unknown[]) => {
      statements.push(sql);
      if (sql.includes("FROM admin_sessions")) {
        return { rows: [{ admin_id: "test-admin" }], rowCount: 1 };
      }
      if (sql.includes("WITH local_day AS")) {
        return {
          rows: [{
            total_orders: 1,
            total_orders_today: 1,
            new_orders: 1,
            preparing_orders: 0,
            ready_orders: 0,
            completed_orders: 0,
            cancelled_orders: 0,
            verified_revenue_today: 120,
            demo_revenue_today: 0,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("JOIN payments p")) {
        return sql.includes("COUNT(*)")
          ? { rows: [{ total: 0 }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT o.id, o.order_number")) {
        return { rows: [operationalOrder], rowCount: 1 };
      }
      if (sql.includes("COUNT(*)::int AS total")) {
        return {
          rows: [{
            total: 1,
            placed: 1,
            preparing: 0,
            ready: 0,
            completed: 0,
            cancelled: 0,
          }],
          rowCount: 1,
        };
      }
      return originalQuery(sql, values as never);
    },
  });

  try {
    const cookie = `fr_admin_session=${"a".repeat(48)}`;
    const ordersResponse = await fetch(`${baseUrl}/api/admin/orders?status=ALL`, {
      headers: { Cookie: cookie },
    });
    const orders = await ordersResponse.json();
    assert.equal(ordersResponse.status, 200);
    assert.deepEqual(orders.items.map((order: { payment_status: string }) =>
      order.payment_status), ["PAID"]);
    assert.deepEqual(orders.counts, {
      ALL: 1,
      PLACED: 1,
      PREPARING: 0,
      READY: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    });

    const dashboardResponse = await fetch(
      `${baseUrl}/api/admin/dashboard`,
      { headers: { Cookie: cookie } },
    );
    const dashboard = await dashboardResponse.json();
    assert.equal(dashboardResponse.status, 200);
    assert.equal(dashboard.summary.total_orders, 1);
    assert.equal(dashboard.summary.cancelled_orders, 0);
    assert.match(
      statements.find((sql) => sql.includes("WITH local_day AS")) ?? "",
      /GROUP BY local_day\.start_at/,
    );

    const verificationQueue = await fetch(
      `${baseUrl}/api/admin/payment-claims`,
      { headers: { Cookie: cookie } },
    );
    const reconciliationQueue = await fetch(
      `${baseUrl}/api/admin/payment-reconciliation`,
      { headers: { Cookie: cookie } },
    );
    assert.equal(verificationQueue.status, 200);
    assert.equal(reconciliationQueue.status, 200);

    const operationalQueries = statements.filter(
      (sql) =>
        !sql.includes("JOIN payments p") &&
        (sql.includes("FROM orders") || sql.includes("FROM operational_orders")),
    );
    assert.ok(
      operationalQueries.length >= 3 &&
        operationalQueries.every((sql) => sql.includes("payment_status = 'PAID'")),
    );
    const previousMode = process.env.NODE_ENV;
    const productionStart = statements.length;
    try {
      process.env.NODE_ENV = "production";
      for (const path of ["/api/admin/orders?status=ALL", "/api/admin/dashboard"]) {
        const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
        assert.equal(response.status, 200);
      }
    } finally {
      process.env.NODE_ENV = previousMode;
    }
    const productionQueries = statements.slice(productionStart).filter((sql) =>
      sql.includes("FROM orders"));
    assert.equal(productionQueries.length, 3);
    for (const sql of productionQueries) {
      assert.match(sql, /verified_payment.payment_source = 'MANUAL_UPI'/);
      assert.match(sql, /verified_payment.payment_status = 'PAID'/);
      assert.match(sql, /verified_payment.verified_at IS NOT NULL/);
      assert.match(sql, /verified_payment.verified_by IS NOT NULL/);
      assert.match(sql, /verified_payment.verified_transaction_reference IS NOT NULL/);
      assert.match(sql, /verified_payment.reconciliation_required IS FALSE/);
    }
    assert.ok(
      statements.some(
        (sql) =>
          sql.includes("payment_status = 'PENDING_VERIFICATION'") &&
          sql.includes("payment_expires_at > NOW()"),
      ),
    );
    assert.ok(
      statements.some(
        (sql) =>
          sql.includes("payment_status IN ('CANCELLED', 'EXPIRED')") &&
          sql.includes("reconciliation_required IS TRUE"),
      ),
    );
  } finally {
    Object.defineProperty(database, "query", {
      configurable: true,
      value: originalQuery,
    });
  }
});

test("customer payment cancellation is authenticated, idempotent, and never places the attempt", async () => {
  const originalConnect = database.connect.bind(database);
  const orderId = "00000000-0000-4000-8000-000000000102";
  const idempotencyKey = "00000000-0000-4000-8000-000000000103";
  const trackingToken = createHmac("sha256", process.env.ORDER_TRACKING_SECRET!)
    .update(`order-tracking:${idempotencyKey}`)
    .digest("base64url");
  const tokenHash = createHash("sha256").update(trackingToken).digest("hex");
  let paymentStatus = "PENDING_PAYMENT";
  const statements: string[] = [];

  const mockedClient = {
    query: async (sql: string, values?: unknown[]) => {
      statements.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("FOR UPDATE OF o, p")) {
        return {
          rows: [{
            payment_status: paymentStatus,
            payment_expires_at: new Date(Date.now() + 30 * 60_000),
            payment_attempt_active: true,
            tracking_token_hash: tokenHash,
            recorded_payment_status: paymentStatus,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE orders SET payment_status")) {
        paymentStatus = values?.[1] as string;
      }
      if (sql.includes("UPDATE payments SET payment_status")) {
        paymentStatus = values?.[1] as string;
      }
      return { rows: [], rowCount: 1 };
    },
    release: () => undefined,
  } as unknown as PoolClient;
  Object.defineProperty(database, "connect", {
    configurable: true,
    value: async () => mockedClient,
  });

  try {
    const request = () => fetch(
      `${baseUrl}/api/orders/${orderId}/payment-cancel`,
      { method: "POST", headers: { Authorization: `Bearer ${trackingToken}` } },
    );
    const firstResponse = await request();
    assert.equal(firstResponse.status, 200);
    assert.equal((await firstResponse.json()).paymentStatus, "CANCELLED");
    const repeatedResponse = await request();
    assert.equal(repeatedResponse.status, 200);
    assert.equal((await repeatedResponse.json()).paymentStatus, "CANCELLED");
    assert.ok(statements.some((sql) => sql.includes("FOR UPDATE OF o, p")));
    assert.ok(
      statements.some((sql) => sql.includes("UPDATE orders SET payment_status")),
    );
    assert.ok(
      statements.every((sql) => !sql.includes("SET order_status = 'PLACED'")),
    );
  } finally {
    Object.defineProperty(database, "connect", {
      configurable: true,
      value: originalConnect,
    });
  }
});

test("customer references request verification without confirming payment", async () => {
  const originalConnect = database.connect.bind(database);
  const token = "c".repeat(48);
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      return sql.includes("FOR UPDATE OF o, p")
        ? { rows: [{
            payment_status: "PENDING_PAYMENT", recorded_payment_status: "PENDING_PAYMENT",
            order_status: "PENDING_PAYMENT", payment_attempt_active: true,
            tracking_token_hash: createHash("sha256").update(token).digest("hex"),
          }], rowCount: 1 }
        : { rows: [], rowCount: 1 };
    },
    release: () => undefined,
  } as unknown as PoolClient;
  Object.defineProperty(database, "connect", { configurable: true, value: async () => client });
  try {
    const oversized = await fetch(`${baseUrl}/api/orders/00000000-0000-4000-8000-000000000105/payment-claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transactionReference: "R".repeat(101) }),
    });
    assert.equal(oversized.status, 400);
    assert.equal(statements.length, 0, "oversized reference must not reach the database");
    const response = await fetch(`${baseUrl}/api/orders/00000000-0000-4000-8000-000000000105/payment-claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transactionReference: "R".repeat(100), paymentStatus: "PAID" }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).paymentStatus, "PENDING_VERIFICATION");
    assert.ok(statements.includes("COMMIT"));
    assert.ok(statements.some((sql) => sql.includes("FOR UPDATE OF o, p")));
    assert.ok(statements.filter((sql) => sql.startsWith("UPDATE")).every((sql) =>
      !sql.includes("'PAID'") && !sql.includes("'PLACED'") && !sql.includes("verified_at")));
  } finally {
    Object.defineProperty(database, "connect", { configurable: true, value: originalConnect });
  }
});

test("concurrent verification serializes retries and preserves pending state on database failures", async (t) => {
  const originalConnect = database.connect;
  const originalQuery = database.query;
  const originalError = console.error;
  try {
    console.error = () => undefined; // Expected injected failures; never print provider errors.
    Object.defineProperty(database, "query", { configurable: true, value: (async (sql: string) => {
      assert.ok(sql.includes("FROM admin_sessions"), "Unexpected pool query must not contact a real database");
      return { rows: [{ admin_id: "test-admin" }], rowCount: 1 };
    }) as typeof database.query });
    for (const fault of [null, "55P03", "57014", "40P01", "23505"] as const) {
      await t.test(fault || "same-reference concurrent success", async () => {
        let state = { payment_status: "PENDING_VERIFICATION", order_status: "PENDING_PAYMENT",
          verified_transaction_reference: null as string | null };
        let committedUpdates = 0;
        let lockTail = Promise.resolve();
        let released = 0;
        Object.defineProperty(database, "connect", { configurable: true, value: (async () => {
          let unlock: (() => void) | undefined;
          let staged = { ...state };
          let updates = 0;
          const releaseLock = () => { unlock?.(); unlock = undefined; };
          return {
            query: async (sql: string, values?: unknown[]) => {
              if (sql === "BEGIN") return { rows: [], rowCount: 0 };
              if (sql === "COMMIT") {
                state = staged; committedUpdates += updates; releaseLock();
                return { rows: [], rowCount: 0 };
              }
              if (sql === "ROLLBACK") { releaseLock(); return { rows: [], rowCount: 0 }; }
              if (sql.includes("SELECT o.payment_status, o.order_status")) {
                assert.ok(sql.includes("FOR UPDATE OF o, p"));
                const previous = lockTail;
                lockTail = new Promise<void>((done) => { unlock = done; });
                await previous;
                staged = { ...state };
                if (fault) throw Object.assign(new Error("injected database failure"), { code: fault });
                return { rows: [{ ...staged, recorded_payment_status: staged.payment_status,
                  payment_expired: false, payment_source: "MANUAL_UPI", reconciliation_required: false }], rowCount: 1 };
              }
              if (sql.includes("UPDATE payments")) {
                staged.payment_status = values![1] as string;
                staged.verified_transaction_reference = values![3] as string;
                updates++;
              } else if (sql.includes("UPDATE orders")) {
                staged.payment_status = values![1] as string;
                staged.order_status = "PLACED"; updates++;
              } else throw new Error("Unexpected transaction query");
              return { rows: [], rowCount: 1 };
            },
            release: () => { releaseLock(); released++; },
          };
        }) as typeof database.connect });
        const request = () => fetch(`${baseUrl}/api/admin/orders/00000000-0000-4000-8000-000000000105/payment-verification`, {
          method: "POST", signal: AbortSignal.timeout(5000),
          headers: { Cookie: `fr_admin_session=${"a".repeat(48)}`, "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "PAID", verifiedTransactionReference: "synthetic-concurrent-reference" }),
        });
        const responses = await Promise.all([request(), request()]);
        assert.deepEqual(responses.map((response) => response.status), fault === "23505" ? [409, 409]
          : fault ? [500, 500] : [200, 200]);
        await Promise.all(responses.map((response) => response.body?.cancel()));
        assert.equal(released, 2);
        assert.equal(committedUpdates, fault ? 0 : 2, "Successful retries commit only one payment/order mutation pair");
        assert.equal(state.payment_status, fault ? "PENDING_VERIFICATION" : "PAID");
        assert.equal(state.order_status, fault ? "PENDING_PAYMENT" : "PLACED");
      });
    }
  } finally {
    Object.defineProperty(database, "connect", { configurable: true, value: originalConnect });
    Object.defineProperty(database, "query", { configurable: true, value: originalQuery });
    console.error = originalError;
  }
});

test("manual verification is idempotent and late receipts only enter reconciliation", async () => {
  const originalConnect = database.connect.bind(database);
  const originalQuery = database.query.bind(database);
  const orderId = "00000000-0000-4000-8000-000000000104";
  let paymentStatus = "PENDING_VERIFICATION";
  let paymentExpiresAt = new Date(Date.now() + 30 * 60_000);
  let verifiedReference: string | null = null;
  let reconciliationRequired = false;
  let orderStatus = "PENDING_PAYMENT";
  const writes: string[] = [];

  const mockedClient = {
    query: async (sql: string, values?: unknown[]) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT o.payment_status, o.order_status")) {
        return {
          rows: [{
            payment_status: paymentStatus,
            order_status: orderStatus,
            payment_expires_at: paymentExpiresAt,
            payment_expired: paymentExpiresAt.getTime() <= Date.now(),
            recorded_payment_status: paymentStatus,
            payment_source: "MANUAL_UPI",
            verified_transaction_reference: verifiedReference,
            reconciliation_required: reconciliationRequired,
          }],
          rowCount: 1,
        };
      }
      writes.push(sql);
      if (sql.includes("UPDATE payments")) {
        paymentStatus = values?.[1] as string;
        verifiedReference = values?.[3] as string | null;
        reconciliationRequired = values?.[4] as boolean;
      } else if (sql.includes("UPDATE orders")) {
        paymentStatus = values?.[1] as string;
        if (sql.includes("order_status = CASE")) orderStatus = "PLACED";
      }
      return { rows: [], rowCount: 1 };
    },
    release: () => undefined,
  } as unknown as PoolClient;
  Object.defineProperty(database, "connect", {
    configurable: true,
    value: async () => mockedClient,
  });
  Object.defineProperty(database, "query", {
    configurable: true,
    value: async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM admin_sessions")) {
        return { rows: [{ admin_id: "test-admin" }], rowCount: 1 };
      }
      return originalQuery(sql, values as never);
    },
  });

  try {
    const cookie = `fr_admin_session=${"a".repeat(48)}`;
    const verify = (reference: string) => fetch(
      `${baseUrl}/api/admin/orders/${orderId}/payment-verification`,
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "PAID",
          verifiedTransactionReference: reference,
        }),
      },
    );

    const verified = await verify("verified-ref-1234");
    assert.equal(verified.status, 200);
    assert.equal((await verified.json()).reconciliationRequired, false);
    const repeated = await verify("verified-ref-1234");
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).paymentStatus, "PAID");
    assert.equal(writes.length, 2);
    assert.equal(orderStatus, "PLACED");

    paymentStatus = "EXPIRED";
    paymentExpiresAt = new Date(Date.now() - 1000);
    verifiedReference = null;
    reconciliationRequired = false;
    orderStatus = "PENDING_PAYMENT";
    writes.length = 0;
    const reconciled = await verify("late-ref-1234");
    const reconciliationResult = await reconciled.json();
    assert.equal(reconciled.status, 200);
    assert.equal(reconciliationResult.paymentStatus, "EXPIRED");
    assert.equal(reconciliationResult.reconciliationRequired, true);
    assert.equal(paymentStatus, "EXPIRED");
    assert.equal(orderStatus, "PENDING_PAYMENT");
    assert.ok(writes.every((sql) => !sql.includes("order_status = CASE")));
    const repeatedReconciliation = await verify("late-ref-1234");
    assert.equal(repeatedReconciliation.status, 200);
    assert.equal((await repeatedReconciliation.json()).reconciliationRequired, true);
    assert.equal(writes.length, 2);
    for (const [initialStatus, expectedStatus] of [
      ["CANCELLED", "CANCELLED"],
      ["PENDING_VERIFICATION", "EXPIRED"],
    ]) {
      paymentStatus = initialStatus;
      verifiedReference = null;
      reconciliationRequired = false;
      orderStatus = "PENDING_PAYMENT";
      writes.length = 0;
      const response = await verify(`late-${initialStatus}-reference`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.paymentStatus, expectedStatus);
      assert.equal(body.reconciliationRequired, true);
      assert.equal(orderStatus, "PENDING_PAYMENT");
      assert.ok(writes.every((sql) => !sql.includes("order_status = CASE")));
    }
  } finally {
    Object.defineProperty(database, "connect", {
      configurable: true,
      value: originalConnect,
    });
    Object.defineProperty(database, "query", {
      configurable: true,
      value: originalQuery,
    });
  }
});

test("production rejects demo confirmation even when the flag is enabled", async () => {
  const previousMode = process.env.NODE_ENV;
  const previousFlag = process.env.DEMO_PAYMENTS_ENABLED;
  try {
    process.env.NODE_ENV = "production";
    process.env.DEMO_PAYMENTS_ENABLED = "true";
    const config = await fetch(`${baseUrl}/api/payment-config`);
    assert.equal((await config.json()).demoPaymentsEnabled, false);
    const response = await fetch(`${baseUrl}/api/orders/00000000-0000-4000-8000-000000000104/demo-payment`, {
      method: "POST",
    });
    assert.equal(response.status, 404);
  } finally {
    process.env.NODE_ENV = previousMode;
    if (previousFlag === undefined) delete process.env.DEMO_PAYMENTS_ENABLED;
    else process.env.DEMO_PAYMENTS_ENABLED = previousFlag;
  }
});

test("server-side expiry updates pending attempts without deleting payment history", async () => {
  const originalQuery = database.query.bind(database);
  let expiryQuery = "";
  Object.defineProperty(database, "query", {
    configurable: true,
    value: async (sql: string) => {
      expiryQuery = sql;
      return { rows: [], rowCount: 2 };
    },
  });

  try {
    const { expirePendingPayments } = await import("./paymentExpiry.js");
    assert.equal(await expirePendingPayments(), 2);
    assert.match(expiryQuery, /payment_status IN \('PENDING_PAYMENT', 'PENDING_VERIFICATION'\)/);
    assert.match(expiryQuery, /payment_expires_at <= NOW\(\)/);
    assert.match(expiryQuery, /UPDATE public\.payments/);
    assert.doesNotMatch(expiryQuery, /DELETE/i);
  } finally {
    Object.defineProperty(database, "query", {
      configurable: true,
      value: originalQuery,
    });
  }
});

test("admin login accepts a 64-character password without truncation", async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "not-the-configured-admin",
      password: longTestPassword,
    }),
  });
  assert.equal(response.status, 401);
});

test("customer tracking requires an order tracking token", async () => {
  const response = await fetch(
    `${baseUrl}/api/orders/00000000-0000-4000-8000-000000000001`,
  );
  assert.equal(response.status, 404);
});

test("order quote validates new and legacy fulfillment inputs before database access", async (t) => {
  const invalidDineInTable = await fetch(`${baseUrl}/api/orders/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderType: "DINE_IN",
      tableNumber: "A-2",
      items: [{ productId: "test-product", size: "Regular", quantity: 1 }],
    }),
  });
  assert.equal(invalidDineInTable.status, 400);

  await t.test("legacy table orders still require a table number", async () => {
    const response = await fetch(`${baseUrl}/api/orders/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fulfillmentType: "TABLE",
        items: [{ productId: "test-product", size: "Regular", quantity: 1 }],
      }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /table number is required/i);
  });
});

test("disallowed admin origin is rejected", async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: "POST",
    headers: {
      Origin: "https://unapproved.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username: "test", password: "testpass" }),
  });
  assert.equal(response.status, 403);
});

test("CORS does not grant an unapproved origin and Helmet security headers are present", async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: "https://unapproved.example" },
  });
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("strict-transport-security"), null);
});
