import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const apiBaseURL = process.env.API_BASE_URL || "http://localhost:5000";
const menuEndpoint = `${apiBaseURL}/api/menu`;

type MenuProduct = {
  id: string;
  name: string;
  category: string;
  available: boolean;
  availabilityStatus: "AVAILABLE" | "SOLD_OUT" | "COMING_SOON";
  variants: Array<{ size: "Regular" | "Large"; price: number }>;
  archived?: boolean;
};

async function loadMenu(request: APIRequestContext) {
  const response = await request.get(menuEndpoint);
  expect(response.ok(), "public menu API should respond successfully").toBeTruthy();
  return (await response.json()) as MenuProduct[];
}

async function seedCart(page: Page, product: MenuProduct) {
  const variant = product.variants.find((item) => item.size === "Regular")
    ?? product.variants[0];
  if (!variant) throw new Error(`Product "${product.id}" has no price variant.`);

  await page.addInitScript(
    ({ id, name, size, price }) => {
      if (!window.localStorage.getItem("fruits-and-roots-cart")) {
        window.localStorage.setItem(
          "fruits-and-roots-cart",
          JSON.stringify([{ id, name, size, price, quantity: 1 }]),
        );
      }
    },
    { id: product.id, name: product.name, size: variant.size, price: variant.price },
  );
}

test("customer menu loads backend products and supports search and category filters", async ({
  page,
  request,
}) => {
  const products = await loadMenu(request);
  expect(products.length).toBeGreaterThan(0);
  expect(products.every((product) => product.archived !== true)).toBeTruthy();

  await page.goto("/menu");
  await expect(page.getByRole("heading", { name: "Explore Our Menu" })).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();

  const firstProduct = products[0];
  await page.getByRole("searchbox", { name: "Search menu items" }).fill(firstProduct.name);
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article").first()).toContainText(firstProduct.name);

  const categoryButton = page.getByRole("button", {
    name: firstProduct.category,
    exact: true,
  });
  if (await categoryButton.count()) {
    await categoryButton.click();
    await expect(categoryButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("article").first()).toContainText(firstProduct.name);
  }
});

test("customer menu product imagery loads successfully", async ({ page }) => {
  await page.goto("/menu");
  const image = page.locator("article img").first();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth), {
    timeout: 10_000,
    message: "first rendered menu image should load",
  }).toBeGreaterThan(0);
});

test("menu product prices match the public API and unavailable items cannot be added", async ({
  page,
  request,
}) => {
  const products = await loadMenu(request);
  const available = products.find((product) => product.available && product.variants.length);
  expect(available, "menu should contain an available product").toBeTruthy();

  await page.goto(`/product/${encodeURIComponent(available!.id)}`);
  await expect(page.getByRole("heading", { name: available!.name })).toBeVisible();
  const regular = available!.variants.find((variant) => variant.size === "Regular")
    ?? available!.variants[0];
  await expect(
    page.getByRole("button", {
      name: `${regular.size} — ₹${regular.price}`,
    }),
  ).toBeVisible();

  for (const status of ["SOLD_OUT", "COMING_SOON"] as const) {
    const unavailable = products.find(
      (product) => product.availabilityStatus === status,
    );
    if (!unavailable) continue;

    await page.goto(`/product/${encodeURIComponent(unavailable.id)}`);
    await expect(
      page.getByText(status === "SOLD_OUT" ? "Sold Out" : "Coming Soon", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to Cart" })).toHaveCount(0);
  }
});

test("cart quantities, totals, removal, persistence, and empty state work locally", async ({
  page,
  request,
}) => {
  const products = await loadMenu(request);
  const product = products.find((item) => item.available && item.variants.length);
  expect(product, "menu should contain an available product").toBeTruthy();
  const variant = product!.variants.find((item) => item.size === "Regular")
    ?? product!.variants[0];
  expect(variant).toBeTruthy();

  await seedCart(page, product!);
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible();
  await expect(page.locator('[aria-label="Cart total"]')).toContainText(
    `₹${variant!.price}`,
  );

  await page.getByRole("button", { name: `Increase ${product!.name} quantity` }).click();
  await expect(page.locator('[aria-label="Cart total"]')).toContainText(
    `₹${variant!.price * 2}`,
  );
  await page.reload();
  await expect(page.locator('[aria-label="Cart total"]')).toContainText(
    `₹${variant!.price * 2}`,
  );

  await page.getByRole("button", { name: `Decrease ${product!.name} quantity` }).click();
  await page.getByRole("button", { name: `Remove ${product!.name}, ${variant!.size} size` }).click();
  await expect(page.getByRole("heading", { name: "Your bag is taking a break" })).toBeVisible();
});

test("checkout form supports optional phone without submitting an order", async ({
  page,
  request,
}) => {
  const products = await loadMenu(request);
  const product = products.find((item) => item.available && item.variants.length);
  expect(product, "menu should contain an available product").toBeTruthy();
  await seedCart(page, product!);
  await page.goto("/checkout");

  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByLabel(/Phone number/)).toBeVisible();
  await expect(page.getByLabel(/Phone number/)).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Continue to Payment" }).first(),
  ).toBeEnabled();
});

test("admin login is reachable and protected admin APIs reject anonymous requests", async ({
  page,
  request,
}) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();

  const response = await request.get(`${apiBaseURL}/api/admin/dashboard`);
  expect(response.status()).toBe(401);
});

test("customer tracking requires an order access token and APIs reject invalid payloads", async ({
  request,
}) => {
  const tracking = await request.get(
    `${apiBaseURL}/api/orders/00000000-0000-4000-8000-000000000001`,
  );
  expect(tracking.status()).toBe(404);

  const invalidOrder = await request.post(`${apiBaseURL}/api/orders`, {
    data: {},
  });
  expect(invalidOrder.status()).toBe(400);

  const invalidQuote = await request.post(`${apiBaseURL}/api/orders/quote`, {
    data: { fulfillmentType: "PICKUP", items: [] },
  });
  expect(invalidQuote.status()).toBe(400);
});

test("customer tracking sees status changes automatically and stops after completion", async ({
  page,
}) => {
  const orderId = "00000000-0000-4000-8000-000000000001";
  const statuses = ["PLACED", "PREPARING", "READY", "COMPLETED"] as const;
  let requestCount = 0;
  await page.addInitScript(
    ({ id }) => {
      window.sessionStorage.setItem(`fruits-roots-order-token:${id}`, "test-tracking-token");
    },
    { id: orderId },
  );
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    const authorization = route.request().headers().authorization;
    expect(authorization).toBe("Bearer test-tracking-token");
    const status = statuses[Math.min(requestCount, statuses.length - 1)];
    requestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        orderId,
        orderNumber: "E2E-READ-ONLY",
        customerName: "Test Customer",
        fulfillmentType: "PICKUP",
        tableNumber: null,
        totalAmount: 100,
        paymentStatus: "PAID",
        paymentSource: "DEMO",
        orderStatus: status,
        createdAt: new Date().toISOString(),
        items: [],
        paymentDetails: null,
        demoPaymentsEnabled: true,
      }),
    });
  });

  await page.goto(`/order/${orderId}`);
  const progress = page.locator("ol");
  const expectActiveStatus = (label: string) =>
    expect.poll(
      () => progress.getByText(label, { exact: true }).getAttribute("class"),
      { timeout: 5_000 },
    ).toContain("font-semibold");
  await expectActiveStatus("Order Placed");
  await expectActiveStatus("Preparing");
  await expectActiveStatus("Ready for pickup");
  await expectActiveStatus("Completed");

  const completedRequestCount = requestCount;
  await page.waitForTimeout(2_500);
  expect(requestCount).toBe(completedRequestCount);
});

test("dashboard auto-refreshes all-time order count using mocked responses", async ({
  page,
}) => {
  let dashboardRequests = 0;
  await page.route("**/api/admin/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ adminId: "e2e-admin" }),
    });
  });
  await page.route("**/api/admin/dashboard", async (route) => {
    dashboardRequests += 1;
    const allOrders = dashboardRequests > 1 ? 9 : 8;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: {
          all_orders: allOrders,
          total_orders_today: 1,
          new_orders: 0,
          preparing_orders: 0,
          ready_orders: 0,
          completed_orders: 1,
          verified_revenue_today: 0,
          demo_revenue_today: 90,
        },
        demoPaymentsEnabled: true,
      }),
    });
  });
  await page.route("**/api/admin/orders?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        total: 0,
        limit: 25,
        offset: 0,
        statusCounts: {
          ALL: 0,
          PLACED: 0,
          PREPARING: 0,
          READY: 0,
          COMPLETED: 0,
          CANCELLED: 0,
        },
      }),
    });
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const allOrdersCard = page.locator("article").filter({ hasText: "All orders" }).first();
  await expect(allOrdersCard).toContainText("8");
  await expect(allOrdersCard).toContainText("9", { timeout: 5_000 });
  expect(dashboardRequests).toBeGreaterThanOrEqual(2);
});

test("security headers are set and unapproved origins receive no CORS grant", async ({
  request,
}) => {
  const response = await request.get(`${apiBaseURL}/api/health`, {
    headers: { Origin: "https://not-approved.invalid" },
  });
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
});

test("customer and admin pages do not overflow the configured viewport", async ({ page }) => {
  for (const path of ["/menu", "/cart", "/admin/login"]) {
    await page.goto(path);
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  }
});
