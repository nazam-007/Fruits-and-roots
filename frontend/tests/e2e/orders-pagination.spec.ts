import { expect, test } from "@playwright/test";

const initialTotals: Record<string, number> = {
  ALL: 31,
  PLACED: 31,
  PREPARING: 14,
  READY: 15,
  COMPLETED: 30,
  CANCELLED: 0,
};

const statuses = ["ALL", "PLACED", "PREPARING", "READY", "COMPLETED", "CANCELLED"];
const labels: Record<string, string> = {
  ALL: "All",
  PLACED: "New",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

test("admin orders paginate each status and retain the page during polling", async ({ page }) => {
  const totals = { ...initialTotals };
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = {};

    if (path.endsWith("/auth/session")) {
      body = { adminId: "pagination-test-admin" };
    } else if (path.endsWith("/orders")) {
      const status = url.searchParams.get("status") ?? "ALL";
      const limit = Number(url.searchParams.get("limit") ?? 15);
      const currentPage = Number(url.searchParams.get("page") ?? 1);
      const total = totals[status] ?? 0;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const offset = (currentPage - 1) * limit;
      const items = Array.from(
        { length: Math.max(0, Math.min(limit, total - offset)) },
        (_, index) => ({
          id: `${status}-${offset + index + 1}`,
          order_number: `${status}-${offset + index + 1}`,
          customer_name: "Pagination Test",
          customer_phone: null,
          fulfillment_type: "PICKUP",
          total_amount: 250,
          payment_status: "PAID",
          order_status: status === "ALL" ? "PLACED" : status,
          created_at: "2026-01-01T10:00:00.000Z",
          payment_source: null,
        }),
      );
      const counts = Object.fromEntries(
        statuses.map((key) => [key, totals[key] ?? 0]),
      );
      body = {
        items,
        orders: items,
        page: currentPage,
        total,
        totalPages,
        counts,
        statusCounts: counts,
        limit,
        offset,
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto("/admin/orders");
  await expect(page.getByRole("button", { name: /New/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#admin-orders-table tbody tr")).toHaveCount(15);
  await expect(page.getByText("Showing 1–15 of 31 orders")).toBeVisible();
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/status=PLACED&page=2/);
  await expect(page.locator("#admin-orders-table tbody tr")).toHaveCount(15);
  await expect(page.getByText("Showing 16–30 of 31 orders")).toBeVisible();

  totals.PLACED = 15;
  await expect(page).toHaveURL(/status=PLACED&page=1/, { timeout: 5_000 });
  await expect(page.locator("#admin-orders-table tbody tr")).toHaveCount(15);
  const newTab = page.getByRole("button", { name: /^New/ });
  await expect(newTab).toHaveAttribute("aria-pressed", "true");
  await expect(newTab.locator("span")).toHaveText("15");
  await page.goBack();
  await expect(page).toHaveURL(/status=PLACED$/);
  await page.goForward();
  await expect(page).toHaveURL(/status=PLACED&page=1/);

  for (const status of statuses) {
    await page.getByRole("button", { name: new RegExp(labels[status]) }).click();
    await expect(page).toHaveURL(new RegExp(`status=${status}&page=1`));
    const expectedCount = Math.min(totals[status] ?? 0, 15);
    if (expectedCount === 0) {
      await expect(page.getByRole("heading", { name: "No orders found" })).toBeVisible();
    } else {
      await expect(page.locator("#admin-orders-table tbody tr")).toHaveCount(expectedCount);
    }
    await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
    if ((totals[status] ?? 0) <= 15) {
      await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
    }
  }

  await page.getByRole("button", { name: /Preparing/ }).click();
  await expect(page.locator("#admin-orders-table tbody tr")).toHaveCount(14);
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
  totals.PREPARING = 16;
  await expect(page.getByRole("button", { name: /^Preparing/ }).locator("span")).toHaveText("16", {
    timeout: 5_000,
  });
  await expect(page.getByRole("button", { name: "Next page" })).toBeEnabled();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
