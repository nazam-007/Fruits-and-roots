import { test, expect, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

async function watchConnectionAttempts(page: Page) {
  await page.addInitScript(() => {
    const attempts: string[] = [];
    Object.defineProperty(window, "previewConnectionAttempts", { value: attempts });
    for (const key of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"] as const) {
      Object.defineProperty(window, key, { value: new Proxy(window[key], {
        apply(target, receiver, args) { attempts.push(key); return Reflect.apply(target, receiver, args); },
        construct(target, args) { attempts.push(key); return Reflect.construct(target, args); },
      }) });
    }
  });
}

async function connectionAttempts(page: Page) {
  return page.evaluate(() => (window as unknown as { previewConnectionAttempts: string[] }).previewConnectionAttempts);
}

test("production preview excludes operational code/configuration and blocks network connections", () => {
  const assets = resolve("dist/assets");
  const js = readdirSync(assets).filter(file => file.endsWith(".js")).map(file => readFileSync(resolve(assets, file), "utf8")).join("\n");
  expect(js).not.toMatch(/supabase|razorpay|localhost:5000|\/api\/|postgres(?:ql)?:\/\/|rzp_(?:test|live)_|sb_secret_|eyJ[A-Za-z0-9_-]{20,}/i);
  expect(js).not.toContain("preview-api-must-not-load.invalid");
  expect(js).not.toContain("preview-secret-must-not-be-bundled");
  expect(readdirSync(assets).some(file => /^(?:App|MenuPreview)-/.test(file))).toBe(false);
  expect(readFileSync(resolve("dist/index.html"), "utf8").replace(/&#39;/g, "'")).toContain("connect-src 'none'");
});

test("menu and product details work with no API or third-party requests", async ({ page }) => {
  await watchConnectionAttempts(page);
  const unsafe: string[] = [];
  const errors: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:5191" || ["fetch", "xhr", "eventsource", "websocket"].includes(request.resourceType())) unsafe.push(request.resourceType());
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:5191" ? route.continue() : route.abort());
  await page.goto("/menu");
  await expect(page.getByRole("status")).toHaveText("Preview only — ordering coming soon");
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute("content", /connect-src 'none'/);
  await expect(page.locator("article")).toHaveCount(4);
  await expect(page.locator("img").first()).toBeVisible();
  expect(await page.locator("img").first().evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Fruitopia", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("searchbox").fill("Garden");
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: "View Garden Sandwich" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Garden Sandwich");
  await expect(page.getByText("₹90", { exact: true })).toBeVisible();
  expect(await connectionAttempts(page)).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Garden Sandwich");
  await expect(page.locator("form, iframe")).toHaveCount(0);
  expect(unsafe).toEqual([]);
  expect(errors).toEqual([]);
  expect(await connectionAttempts(page)).toEqual([]);
});

test("operational and unknown deep links never mount ordering, tracking or authentication", async ({ page }) => {
  await watchConnectionAttempts(page);
  const attempts: string[] = [];
  page.on("request", request => {
    if (["fetch", "xhr", "eventsource", "websocket"].includes(request.resourceType()) || new URL(request.url()).origin !== "http://127.0.0.1:5191") attempts.push(request.resourceType());
  });
  for (const path of ["/cart", "/checkout", "/payment/sample", "/order/sample", "/track/sample", "/admin", "/admin/login", "/admin/orders", "/api/orders", "/product/unknown"]) {
    await page.goto(path);
    await expect(page.getByRole("status")).toHaveText("Preview only — ordering coming soon");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This feature is unavailable in preview");
    await expect(page.locator("form, iframe, input, button")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Browse sample menu" })).toBeVisible();
    await page.waitForTimeout(50);
    expect(await connectionAttempts(page)).toEqual([]);
  }
  expect(attempts).toEqual([]);
});

for (const width of [320, 768, 1440]) {
  test(`sample menu and product details fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    for (const path of ["/menu", "/product/sample-juice"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}
