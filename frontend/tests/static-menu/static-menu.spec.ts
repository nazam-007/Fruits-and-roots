import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import manifest from "../../../docs/menu-restoration/approved-menu.manifest.json" with { type: "json" };
import snapshot from "../../src/data/static-menu.snapshot.json" with { type: "json" };

test("snapshot exactly preserves approved identities, prices and availability", () => {
  expect(snapshot.products).toHaveLength(37);
  expect(snapshot.products.reduce((sum, item) => sum + item.variants.length, 0)).toBe(69);
  expect(snapshot.categories).toEqual(manifest.categories);
  expect(snapshot.products.map(p => p.id)).toEqual(manifest.products.map(p => p.id));
  for (const product of manifest.products) {
    const actual = snapshot.products.find(p => p.id === product.id)!;
    expect(actual.name).toBe(product.name);
    expect(actual.category).toBe(product.category);
    expect(actual.available).toBe(product.available);
    expect(actual.availabilityStatus).toBe(product.availability_status);
    expect(actual.pendingRestoration).toBe(product.provenance !== "approved original-database menu snapshot");
    expect(actual.variants).toEqual([...(product.regular_price === null ? [] : [{ size: "Regular", price: product.regular_price }]),
      ...(product.large_price === null ? [] : [{ size: "Large", price: product.large_price }])]);
  }
});

test("production bundle excludes operational modules, service addresses and credential patterns", () => {
  const assets = resolve("dist-static/assets");
  const js = readdirSync(assets).filter(name => name.endsWith(".js")).map(name => readFileSync(resolve(assets, name), "utf8")).join("\n");
  expect(js).not.toMatch(/supabase|razorpay|localhost:5000|\/api\/|postgres(?:ql)?:\/\/|rzp_(?:test|live)_|sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{20,}/i);
  expect(js).not.toContain("VITE_API_URL");
  expect(readdirSync(assets).some(name => /(?:admin|checkout|payment|App-)/i.test(name))).toBe(false);
});

for (const path of ["/", "/cart", "/checkout", "/payment/example", "/track/example", "/admin"]) {
  test(`static-only menu at ${path} makes no API or third-party requests`, async ({ page }) => {
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).origin !== "http://127.0.0.1:5189" || ["fetch", "xhr", "websocket", "eventsource"].includes(request.resourceType())) requests.push(request.resourceType());
    });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(path);
    await expect(page.getByRole("status")).toHaveText("Menu Preview — Ordering Unavailable");
    await expect(page.locator("article")).toHaveCount(37);
    expect(await page.getByRole("heading", { level: 1 }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(36);
    expect(await page.locator("article").first().evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThanOrEqual(20);
    await expect(page.getByRole("button", { name: /cart|pay|order|cancel|login/i })).toHaveCount(0);
    await expect(page.locator("a:not([href^='#'])")).toHaveCount(0);
    await expect(page.locator("img, iframe, form")).toHaveCount(0);
    await expect(page.getByText(/pending database restoration/)).toHaveCount(3);
    for (const item of snapshot.products) {
      const card = page.locator(`[data-product-id="${item.id}"]`);
      await expect(card.getByRole("heading")).toHaveText(item.name);
      for (const variant of item.variants) await expect(card.getByText(`₹${variant.price}`, { exact: true })).toBeVisible();
    }
    await page.waitForTimeout(250);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const width of [320, 375, 390, 430, 768, 1024]) {
  test(`static menu fits ${width}px and search stays usable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.locator("article")).toHaveCount(37);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("searchbox").fill("Avocado Sandwich");
    await expect(page.locator("article")).toHaveCount(1);
    await expect(page.locator("article")).toContainText("₹90");
    await expect(page.locator("article")).toContainText("₹170");
    await page.screenshot({ path: testInfo.outputPath(`menu-${width}.png`), fullPage: true });
    await page.getByRole("searchbox").fill("no matching product");
    await expect(page.getByText("No matching menu items.")).toBeVisible();
  });
}
