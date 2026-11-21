import { test, expect, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import snapshot from "../../src/data/static-menu.snapshot.json" with { type: "json" };
import manifest from "../../../docs/menu-restoration/approved-menu.manifest.json" with { type: "json" };
import { demoFetch, readDemoTrackingAccess } from "../../src/demo/demoApi";

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const attempts: string[] = [];
    Object.defineProperty(window, "demoConnectionAttempts", { value: attempts });
    for (const key of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"] as const) Object.defineProperty(window, key, { value: new Proxy(window[key], {
      apply(target, receiver, args) { attempts.push(key); return Reflect.apply(target, receiver, args); },
      construct(target, args) { attempts.push(key); return Reflect.construct(target, args); },
    }) });
    // Pre-existing production data must not be loaded, overwritten or displayed.
    localStorage.setItem("fruits-and-roots-cart", JSON.stringify([{ id: "private", name: "Private previous cart", size: "Regular", price: 1, quantity: 1 }]));
    sessionStorage.setItem("fruits-roots-checkout-details", JSON.stringify({ customerName: "Private Previous Customer", customerPhone: "0000000000" }));
  });
  await context.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:5191" ? route.continue() : route.abort());
});
test.afterEach(async ({ context }) => {
  for (const page of context.pages()) {
    if (page.isClosed() || !page.url().startsWith("http://127.0.0.1:5191")) continue;
    expect(await page.evaluate(() => (window as unknown as { demoConnectionAttempts: string[] }).demoConnectionAttempts)).toEqual([]);
    await expect(page.locator("body")).not.toContainText("Private Previous Customer");
    await expect(page.locator("body")).not.toContainText("Private previous cart");
  }
});

test("approved inventory and production bundle preserve menu without provider/configuration leakage", () => {
  expect(snapshot.products).toHaveLength(37);
  expect(snapshot.products.reduce((n, p) => n + p.variants.length, 0)).toBe(69);
  for (const product of manifest.products) {
    const p = snapshot.products.find(p => p.id === product.id)!;
    expect(p.available).toBe(product.available);
    expect(p.variants).toEqual([...(product.regular_price === null ? [] : [{ size: "Regular", price: product.regular_price }]), ...(product.large_price === null ? [] : [{ size: "Large", price: product.large_price }])]);
  }
  const dir = resolve("dist/assets"), js = readdirSync(dir).filter(f => f.endsWith(".js")).map(f => readFileSync(resolve(dir, f), "utf8")).join("\n");
  expect(js).not.toMatch(/supabase|checkout\.razorpay\.com|localhost:5000|postgres(?:ql)?:\/\/|rzp_(?:test|live)_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9_-]{12,}/i);
  expect(js).not.toContain("preview-api-must-not-load.invalid");
  expect(js).not.toContain("preview-secret-must-not-be-bundled");
  expect(readdirSync(dir).some(file => /^App-.*\.js$/.test(file))).toBe(true);
  expect(readdirSync(dir).some(file => /^FrontendPreview-.*\.js$/.test(file))).toBe(false);
  expect(readFileSync(resolve("dist/index.html"), "utf8").replace(/&#39;/g, "'")).toContain("connect-src 'none'");
});

test("local adapter validates pricing, idempotency, unpaid exclusion and transition rules", async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  const request = async (path: string, method = "GET", body?: unknown, token?: string) => demoFetch(path, { method, body: body ? JSON.stringify(body) : undefined, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  try {
    const input = { customerName: "Demo Test", items: [{ productId: "avocado-sandwich", size: "Regular", quantity: 2 }], idempotencyKey: "demo-idempotency", totalAmount: 1 };
    const created = await (await request("/api/orders", "POST", input)).json();
    expect(created.totalAmount).toBe(180);
    expect(readDemoTrackingAccess(created.orderId)).toBe(created.trackingToken);
    expect(readDemoTrackingAccess("production-order-id")).toBeNull();
    expect(readDemoTrackingAccess("demo-not-stored")).toBeNull();
    expect((await (await request("/api/orders", "POST", input)).json()).orderId).toBe(created.orderId);
    expect((await request(`/api/orders/${created.orderId}`, "GET", undefined, "wrong-token")).status).toBe(404);
    await request("/api/admin/auth/login", "POST", {});
    expect((await (await request("/api/admin/orders?status=ALL")).json()).total).toBe(0);
    const paid = `/api/orders/${created.orderId}/demo-payment`;
    await request(paid, "POST", undefined, created.trackingToken);
    await request(paid, "POST", undefined, created.trackingToken);
    expect((await (await request("/api/admin/orders?status=ALL")).json()).total).toBe(1);
    expect((await request(`/api/admin/orders/${created.orderId}/status`, "PATCH", { status: "COMPLETED" })).status).toBe(409);
    expect((await request(`/api/admin/orders/${created.orderId}/status`, "PATCH", { status: "PREPARING" })).ok).toBe(true);
    expect((await request(`/api/orders/${created.orderId}/cancel`, "POST", undefined, created.trackingToken)).status).toBe(409);
    expect((await request("https://example.invalid/api/orders")).status).toBe(403);
    expect((await request(`/api/orders/${created.orderId}/payment-claim`, "POST", {}, created.trackingToken)).status).toBe(409);
    const cancelled = await (await request("/api/orders", "POST", { ...input, idempotencyKey: "cancel-demo" })).json();
    await request(`/api/orders/${cancelled.orderId}/payment-cancel`, "POST", undefined, cancelled.trackingToken);
    expect((await request(`/api/orders/${cancelled.orderId}/demo-payment`, "POST", undefined, cancelled.trackingToken)).status).toBe(409);
    expect([...values.keys()]).toEqual(["fr-demo:state:v1"]);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage); else Reflect.deleteProperty(globalThis, "localStorage");
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});

async function checkout(page: Page) {
  await page.goto("/product/drink-banana");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Banana");
  await page.getByRole("button", { name: /Add to Cart/ }).first().click();
  await expect(page).toHaveURL(/\/cart$/);
  await page.getByRole("button", { name: "Increase Banana quantity" }).click();
  await expect(page.getByLabel("Cart total")).toContainText("258");
  await page.getByRole("button", { name: /Continue to checkout/ }).first().click();
  await expect(page.getByLabel("Your name")).toHaveValue("Demo Guest");
  await page.getByLabel("Your name").fill("Demo Visitor");
  await page.getByRole("button", { name: /Continue to Payment/ }).first().click();
  await expect(page).toHaveURL(/\/payment\/demo-/);
  await expect(page.getByText("DEMO PAYMENT", { exact: true })).toBeVisible();
  await expect(page.locator('img[alt*="QR"], iframe, input#upi-reference')).toHaveCount(0);
  return page.url().split("/").at(-1)!;
}

test("original menu, approved prices and local product images are available", async ({ page }) => {
  await page.goto("/menu");
  await expect(page.getByLabel("Demo notice")).toContainText("Demo mode — no real payments or orders are processed.");
  await expect(page.locator(".menu-product-card")).toHaveCount(37);
  await page.getByRole("searchbox").fill("Avocado Sandwich");
  await expect(page.locator(".menu-product-card")).toHaveCount(1);
  await page.getByRole("link", { name: "View Avocado Sandwich" }).click();
  await expect(page.getByRole("button", { name: "Regular — ₹90" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Large — ₹170" })).toBeVisible();
  expect(await page.locator("main img").first().evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Avocado Sandwich");
});

test("direct menu/admin navigation and refresh retain the original interfaces and local menu edits", async ({ page, context }) => {
  await page.goto("/menu");
  await expect(page.locator(".menu-product-card")).toHaveCount(37);
  await page.reload();
  await expect(page.locator(".menu-product-card")).toHaveCount(37);
  await expect(page.getByLabel("Demo notice")).toContainText("DEMO MODE");
  const admin = await context.newPage();
  admin.on("dialog", dialog => dialog.accept());
  await admin.goto("/menu");
  const documentRequests: string[] = [];
  admin.on("request", request => { if (request.resourceType() === "document") documentRequests.push(request.url()); });
  await admin.getByRole("link", { name: "Demo admin", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "Admin demo" })).toBeVisible();
  expect(documentRequests).toEqual([]);
  await admin.getByRole("button", { name: "Enter admin demo" }).click();
  await expect(admin).toHaveURL(/\/admin$/);
  await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
  await admin.reload();
  await expect(admin).toHaveURL(/\/admin$/);
  await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(admin.getByLabel("Demo notice")).toContainText("DEMO MODE");
  await admin.goto("/admin/menu");
  await admin.getByPlaceholder("Search products").fill("Avocado Sandwich");
  const card = admin.locator("article").filter({ has: admin.getByRole("heading", { name: "Avocado Sandwich", exact: true }) });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Sold out", exact: true }).click();
  await expect(card.getByRole("button", { name: "Sold out", exact: true })).toBeEnabled();
  await page.getByRole("searchbox").fill("Avocado Sandwich");
  await expect(page.locator(".menu-product-card")).toContainText(/Sold Out/i);
  await admin.reload();
  await admin.getByPlaceholder("Search products").fill("Avocado Sandwich");
  await card.getByRole("button", { name: "Available", exact: true }).click();
  await expect(page.locator(".menu-product-card").getByRole("button", { name: "Add Avocado Sandwich to cart" })).toBeEnabled();
});

for (const width of [390, 1440]) {
  test(`cart, checkout, simulated payment and admin tracking work at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    const id = await checkout(page);
    await page.getByRole("button", { name: "Simulate Successful Payment" }).click();
    await expect(page).toHaveURL(new RegExp(`/order/${id}$`));
    await expect(page.getByText("Demo Paid", { exact: true })).toBeVisible();
    // Reproduce the reported access failure: no per-tab tracking keys remain.
    await page.evaluate(() => {
      for (const key of Object.keys(sessionStorage)) if (key.startsWith("fr-demo:fruits-roots-order-token:")) sessionStorage.removeItem(key);
    });
    await page.reload();
    await expect(page.getByText("Demo Paid", { exact: true })).toBeVisible();
    const freshTrackingTab = await context.newPage();
    await freshTrackingTab.setViewportSize({ width, height: 900 });
    await freshTrackingTab.goto(`/order/${id}`);
    await expect(freshTrackingTab.getByText("Demo Paid", { exact: true })).toBeVisible();
    expect(await freshTrackingTab.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith("fr-demo:fruits-roots-order-token:")))).toBe(false);
    await freshTrackingTab.reload();
    await expect(freshTrackingTab.getByText("Demo Paid", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const admin = await context.newPage();
    await admin.setViewportSize({ width, height: 900 });
    await admin.goto(`/admin/orders/${id}`);
    await expect(admin.getByRole("heading", { name: "Admin demo" })).toBeVisible();
    await expect(admin.locator('input[type="password"]')).toHaveCount(0);
    await admin.getByRole("button", { name: "Enter admin demo" }).click();
    await expect(admin.getByRole("button", { name: "Move to PREPARING" })).toBeVisible();
    await admin.getByRole("button", { name: "Move to PREPARING" }).click();
    await expect(page.getByText("Preparing", { exact: true }).first()).toBeVisible();
    await expect(freshTrackingTab.getByText("Preparing", { exact: true }).first()).toBeVisible();
    await admin.getByRole("button", { name: "Move to READY" }).click();
    await expect(page.getByRole("heading", { name: "Ready for pickup", exact: true })).toBeVisible();
    await expect(freshTrackingTab.getByRole("heading", { name: "Ready for pickup", exact: true })).toBeVisible();
    await admin.getByRole("button", { name: "Move to COMPLETED" }).click();
    await expect(admin).toHaveURL(/\/admin\/orders\?status=PLACED/);
    await admin.goto("/admin");
    await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
    await admin.goto("/admin/menu");
    await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
    await freshTrackingTab.reload();
    await expect(freshTrackingTab.getByText("Completed", { exact: true }).first()).toBeVisible();
  });
}

test("unpaid cancellation stays out of admin orders and preserves production storage", async ({ page }) => {
  await checkout(page);
  await page.getByRole("button", { name: "Cancel Payment · Back to Cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await page.goto("/admin/login");
  await page.getByRole("button", { name: "Enter admin demo" }).click();
  await page.goto("/admin/orders?status=ALL");
  await expect(page.getByRole("link", { name: "DEMO-0001", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fruits-and-roots-cart")!)[0].name)).toBe("Private previous cart");
});

test("unknown demo order explains browser-local access without using a production token", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("fruits-roots-order-token:demo-not-stored", "synthetic-production-token-must-not-be-used"));
  await page.goto("/order/demo-not-stored");
  await expect(page.getByRole("alert")).toContainText("This demo order is not stored in this browser");
  await expect(page.locator("body")).not.toContainText("secure tracking access");
});

for (const width of [320, 768]) {
  test(`original menu and product layout fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    for (const path of ["/", "/menu", "/product/avocado-sandwich"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
