import { test, expect } from "@playwright/test";

const id = "00000000-0000-4000-8000-000000000874";
test("counter checkout goes straight to secure tracking; staff receipt leaves preparation unchanged", async ({ page, context }) => {
  let paid = false, status = "PLACED", submissions = 0;
  await page.addInitScript(() => localStorage.setItem("fruits-and-roots-cart", JSON.stringify([
    { id: "browser-product-0", name: "Fixture Fruit Bowl 0", size: "Regular", price: 120, quantity: 1 },
  ])));
  await context.route("**/api/orders", async route => {
    const body = route.request().postDataJSON(); submissions++;
    expect(body.paymentMethod).toBe("PAY_AT_COUNTER"); expect(body.idempotencyKey).toBeTruthy();
    expect(body.paymentStatus).toBeUndefined();
    return route.fulfill({ status: 201, json: { orderId: id, orderNumber: "FR-COUNTER", trackingToken: "counter-fixture-tracking-token", paymentSource: "PAY_AT_COUNTER" } });
  });
  await context.route(`**/api/orders/${id}`, route => {
    expect(route.request().headers().authorization).toBe("Bearer counter-fixture-tracking-token");
    return route.fulfill({ json: { orderId: id, orderNumber: "FR-COUNTER", customerName: "Synthetic", fulfillmentType: "PICKUP",
      paymentStatus: paid ? "PAID" : "UNPAID", paymentSource: "PAY_AT_COUNTER", orderStatus: status, totalAmount: 120, items: [], createdAt: "2026-01-01T00:00:00Z" } });
  });
  await context.route(`**/api/orders/${id}/events`, route => route.fulfill({ contentType: "text/event-stream", body: "" }));
  await context.route("**/api/admin/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/session")) return route.fulfill({ json: { adminId: "counter-fixture" } });
    if (path.endsWith("/counter-payment")) { expect(route.request().postDataJSON()).toEqual({ received: true }); paid = true; return route.fulfill({ json: { paymentStatus: "PAID" } }); }
    if (path.endsWith("/status")) { status = route.request().postDataJSON().status; return route.fulfill({ json: { orderStatus: status } }); }
    return route.fulfill({ json: { id, order_number: "FR-COUNTER", customer_name: "Synthetic", fulfillment_type: "PICKUP", total_amount: 120,
      payment_status: paid ? "PAID" : "UNPAID", recorded_payment_status: paid ? "PAID" : "UNPAID", payment_source: "PAY_AT_COUNTER", order_status: status, created_at: "2026-01-01T00:00:00Z", items: [] } });
  });
  const forbidden: string[] = [];
  context.on("request", request => { const url = new URL(request.url()); if (/(^|\.)razorpay\.com$/.test(url.hostname) || /\/api\/.*(?:razorpay|payment-claim|demo-payment|orders\/quote)/.test(url.pathname)) forbidden.push(request.url()); });
  await page.goto("/checkout");
  await page.getByLabel("Your name").fill("Synthetic");
  await page.getByRole("button", { name: "Place order — Pay at Counter" }).first().click();
  await expect(page).toHaveURL(`/order/${id}`); await expect(page.getByText("Unpaid — Pay at Counter", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText("Unpaid — Pay at Counter", { exact: true })).toBeVisible();
  const admin = await context.newPage(); await admin.goto(`/admin/orders/${id}`);
  admin.on("dialog", dialog => dialog.accept());
  await admin.getByRole("button", { name: "Move to PREPARING" }).click();
  await expect(page.getByText("Preparing", { exact: true }).first()).toBeVisible({ timeout: 8000 });
  await admin.getByRole("button", { name: "Mark counter payment received" }).click();
  await expect(page.getByRole("heading", { name: "Paid", exact: true })).toBeVisible({ timeout: 8000 });
  expect(status).toBe("PREPARING"); expect(submissions).toBe(1); expect(forbidden).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
