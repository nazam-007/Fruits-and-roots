import assert from "node:assert/strict";
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
process.env.TRUSTED_PROXY_IPS = "";
process.env.ADMIN_USERNAME = "security-test";
process.env.ADMIN_PASSWORD_HASH = createAdminPasswordHash(longTestPassword);
process.env.MERCHANT_UPI_ID = "test-merchant@upi";
process.env.MERCHANT_UPI_NAME = "Test Merchant";
process.env.ORDER_TRACKING_SECRET = "t".repeat(32);

let server: Server;
let baseUrl: string;
let database: Pool;

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
    ["order status update", "/api/admin/orders/00000000-0000-4000-8000-000000000001/status", "PATCH"],
    ["payment verification", "/api/admin/orders/00000000-0000-4000-8000-000000000001/payment-verification", "POST"],
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

  const mockedClient = {
    query: async (sql: string) => {
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
            payment_source: "MANUAL_UPI",
            order_status: "PLACED",
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
    assert.equal((await acceptingResponse.json()).orderId, orderId);
    assert.ok(statements.some((sql) => sql.includes("INSERT INTO orders")));
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
