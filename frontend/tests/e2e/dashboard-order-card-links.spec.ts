import { expect, test } from "@playwright/test";

const todayInIndia = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

test("dashboard order cards open the matching Orders filters", async ({ page }) => {
  const statuses = ["ALL", "PLACED", "PREPARING", "READY", "COMPLETED", "CANCELLED"];
  const labels = [
    "All Orders",
    "Orders today",
    "New orders",
    "Preparing",
    "Ready for pickup",
    "Completed",
    "Cancelled",
  ];
  const expectedStatuses = [
    "ALL",
    "ALL",
    "PLACED",
    "PREPARING",
    "READY",
    "COMPLETED",
    "CANCELLED",
  ];
  const totals: Record<string, number> = {
    ALL: 20,
    PLACED: 1,
    PREPARING: 2,
    READY: 3,
    COMPLETED: 0,
    CANCELLED: 4,
  };
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = {};
    if (path.endsWith("/auth/session")) {
      body = { adminId: "dashboard-links-test" };
    } else if (path.endsWith("/dashboard")) {
      body = {
        summary: {
          total_orders: 20,
          total_orders_today: 5,
          new_orders: 1,
          preparing_orders: 2,
          ready_orders: 3,
          completed_orders: 0,
          cancelled_orders: 4,
          verified_revenue_today: 0,
          demo_revenue_today: 0,
        },
        demoPaymentsEnabled: true,
      };
    } else if (path.endsWith("/orders")) {
      const status = url.searchParams.get("status") ?? "ALL";
      const date = url.searchParams.get("date");
      const total = date ? 5 : totals[status] ?? 0;
      const items = total
        ? [{
            id: date ? "today-order" : `${status.toLowerCase()}-order`,
            order_number: date ? "TODAY-ORDER" : `${status}-ORDER`,
            customer_name: "Dashboard Card Test",
            customer_phone: null,
            fulfillment_type: "PICKUP",
            total_amount: 250,
            payment_status: "PAID",
            order_status: status === "ALL" ? "CANCELLED" : status,
            created_at: date ? new Date().toISOString() : "2025-01-01T10:00:00.000Z",
            payment_source: null,
          }]
        : [];
      body = {
        items,
        orders: items,
        page: Number(url.searchParams.get("page") ?? 1),
        total,
        totalPages: Math.max(1, Math.ceil(total / 15)),
        counts: Object.fromEntries(statuses.map((value) => [value, totals[value] ?? 0])),
        statusCounts: Object.fromEntries(statuses.map((value) => [value, totals[value] ?? 0])),
        limit: Number(url.searchParams.get("limit") ?? 15),
        offset: 0,
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto("/admin");
  for (const [index, label] of labels.entries()) {
    const card = page.getByRole("link", { name: new RegExp(label) });
    await expect(card).toBeVisible();
    await card.locator("article").click();
    const expectedStatus = expectedStatuses[index];
    await expect(page).toHaveURL(new RegExp(`status=${expectedStatus}&page=1`));
    if (index === 1) {
      await expect(page).toHaveURL(new RegExp(`date=${todayInIndia()}`));
      await expect(page.getByRole("link", { name: "TODAY-ORDER" })).toBeVisible();
      await page.getByRole("button", { name: /New/ }).click();
      await expect(page).toHaveURL(
        new RegExp(`status=PLACED&page=1&date=${todayInIndia()}`),
      );
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`date=${todayInIndia()}`));
    } else if (index === 0) {
      await expect(page.getByRole("link", { name: "ALL-ORDER" })).toBeVisible();
    } else if (index === 2) {
      await expect(page.getByRole("link", { name: "PLACED-ORDER" })).toBeVisible();
    } else if (index === 5) {
      await expect(page.getByRole("heading", { name: "No orders found" })).toBeVisible();
    }

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    if (index === 0) {
      await page.goForward();
      await expect(page).toHaveURL(/status=ALL&page=1/);
      await page.goBack();
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    }
  }

  await page.getByRole("link", { name: /All Orders/ }).locator("article").click();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/status=ALL&page=2/);
  await expect(page.getByText("Page 2 of 2")).toBeVisible();

  await page.keyboard.press("Tab");
  for (let index = 0; index < 3; index += 1) {
    if (await page.locator("a:focus-visible").count()) break;
    await page.keyboard.press("Tab");
  }
  await expect(page.locator("a:focus-visible")).toHaveCount(1);
});
