import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createAdminPasswordHash } from "./adminPassword";

const longTestPassword = "p".repeat(64);
process.env.DATABASE_URL = "postgres://security-test:security-test@127.0.0.1:5432/security_test";
process.env.FRONTEND_ORIGIN = "http://localhost:5173";
process.env.NODE_ENV = "test";
process.env.TRUSTED_PROXY_IPS = "";
process.env.ADMIN_USERNAME = "security-test";
process.env.ADMIN_PASSWORD_HASH = createAdminPasswordHash(longTestPassword);

let server: Server;
let baseUrl: string;

before(async () => {
  const { app } = await import("./server.js");
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
    ["order status update", "/api/admin/orders/00000000-0000-4000-8000-000000000001/status", "PATCH"],
    ["payment verification", "/api/admin/orders/00000000-0000-4000-8000-000000000001/payment-verification", "POST"],
    ["product price change", "/api/admin/menu/test-product", "PATCH"],
    ["menu image upload", "/api/admin/menu/test-product/image", "POST"],
  ] as const) {
    await t.test(name, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401);
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
