import { expect, test } from "@playwright/test";

test("orders show refund states and poll completion without reloading or losing filters", async ({ page }) => {
  let completed = false;
  await page.route("**/api/admin/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/session")) {
      await route.fulfill({ json: { adminId: "refund-list-admin" } });
      return;
    }
    if (url.pathname.endsWith("/refund") && route.request().method() === "POST") {
      completed = true;
      await route.fulfill({ json: { refund: { status: "COMPLETED" } } });
      return;
    }
    expect(url.searchParams.get("status")).toBe("CANCELLED");
    expect(url.searchParams.get("page")).toBe("2");
    const items = ["PENDING", "COMPLETED", "NONE", "COMPLETED"].map((status, index) => ({
      id: `refund-${index}`, order_number: `REFUND-${index}`, customer_name: "Synthetic",
      customer_phone: null, fulfillment_type: "PICKUP", total_amount: 120,
      payment_status: "PAID", order_status: "CANCELLED", created_at: "2026-01-01T00:00:00Z",
      payment_source: index === 3 ? "RAZORPAY_TEST" : "MANUAL_UPI",
      refund_status: index === 0 && completed ? "COMPLETED" : status,
    }));
    await route.fulfill({ json: { items, orders: items, page: 2, total: 19, totalPages: 2,
      limit: 15, offset: 15, counts: { ALL: 19, PLACED: 0, PREPARING: 0, READY: 0, COMPLETED: 0, CANCELLED: 19 } } });
  });
  await page.goto("/admin/orders?status=CANCELLED&page=2");
  await expect(page.getByRole("columnheader", { name: "Refund Status", exact: true })).toBeVisible();
  const headers = await page.locator("#admin-orders-table th").allTextContents();
  expect(headers.indexOf("Refund Status")).toBe(headers.indexOf("Order status") + 1);
  const row = (index: number) => page.locator("#admin-orders-table tbody tr").filter({ hasText: `REFUND-${index}` });
  await expect(row(0).getByText("Refund Pending", { exact: true })).toHaveClass(/bg-amber-100/);
  await expect(row(1).getByText("Refund Completed", { exact: true })).toHaveClass(/bg-green-100/);
  await expect(row(2).locator("td").nth(6)).toHaveText("—");
  await expect(row(3)).toContainText("Simulated (Test Mode)");
  const originalDocument = await page.evaluateHandle(() => document);
  // The completion form is covered separately; emulate its successful API call here.
  await page.evaluate(async () => {
    await fetch("http://127.0.0.1:5191/api/admin/orders/refund-0/refund", { method: "POST" });
  });
  await expect(row(0)).toContainText("Refund Completed");
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/status=CANCELLED&page=2/);
  expect(await page.evaluate(original => original === document, originalDocument)).toBe(true);
  await originalDocument.dispose();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
