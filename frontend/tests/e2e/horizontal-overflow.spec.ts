import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const viewports = [
  { width: 320, height: 844 },
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

const adminOrder = {
  id: "responsive-test-order",
  order_number: `E2E-${"ORDERIDENTIFIER".repeat(4)}`,
  customer_name: "CustomerNameWithoutSpacesThatApproachesTheMaximumAllowedLengthForAnOrder",
  customer_phone: null,
  fulfillment_type: "PICKUP",
  total_amount: 250,
  payment_status: "PAID",
  order_status: "PREPARING",
  created_at: "2026-01-01T10:00:00.000Z",
  payment_source: "DEMO",
};

const orderDetails = {
  orderId: "responsive-test-order",
  orderNumber: adminOrder.order_number,
  customerName: adminOrder.customer_name,
  fulfillmentType: "PICKUP",
  tableNumber: null,
  totalAmount: 250,
  paymentStatus: "PAID",
  paymentSource: "DEMO",
  orderStatus: "PREPARING",
  createdAt: "2026-01-01T10:00:00.000Z",
  items: [{
    productId: "responsive-test-product",
    productName: "Seasonal Fruit Bowl",
    size: "Regular",
    quantity: 1,
    unitPrice: 250,
  }],
  paymentDetails: {
    merchantName: "Fruits & Roots",
    upiId: "merchant@example",
    currency: "INR",
    paymentUri: "upi://pay",
    qrCodeDataUrl: "",
  },
  demoPaymentsEnabled: true,
};

const customerMenu = [
  {
    id: "responsive-test-product",
    name: "Seasonal Fruit Bowl",
    category: "Fruit Bowls",
    description: "Fresh seasonal fruit prepared to order.",
    image: null,
    featured: false,
    available: true,
    availabilityStatus: "AVAILABLE",
    variants: [
      { size: "Regular", price: 250 },
      { size: "Large", price: 350 },
    ],
  },
  {
    id: "responsive-long-product",
    name: "ProductNameWithoutSpacesThatCouldExtendPastTheMobileViewportAtSmallWidths",
    category: "Fruit Bowls",
    description: "A long-name layout regression fixture.",
    image: null,
    featured: false,
    available: true,
    availabilityStatus: "AVAILABLE",
    variants: [{ size: "Regular", price: 250 }],
  },
];

async function mockAdminReadApis(context: BrowserContext) {
  await context.route("**/api/menu", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(customerMenu),
    });
  });
  await context.route("**/api/orders/responsive-test-order", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(orderDetails),
    });
  });
  await context.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = {};

    if (path.endsWith("/auth/session")) {
      body = { adminId: "responsive-test-admin" };
    } else if (path.endsWith("/dashboard")) {
      body = {
        summary: {
          all_orders: 1,
          total_orders_today: 1,
          new_orders: 0,
          preparing_orders: 1,
          ready_orders: 0,
          completed_orders: 0,
          verified_revenue_today: 0,
          demo_revenue_today: 250,
        },
        demoPaymentsEnabled: true,
      };
    } else if (path.endsWith("/orders")) {
      body = {
        items: [adminOrder],
        total: 1,
        limit: 25,
        offset: 0,
        statusCounts: {
          ALL: 1,
          PLACED: 0,
          PREPARING: 1,
          READY: 0,
          COMPLETED: 0,
          CANCELLED: 0,
        },
      };
    } else if (path.endsWith("/responsive-test-order")) {
      body = {
        ...adminOrder,
        recorded_payment_status: "PAID",
        transaction_reference: null,
        verified_transaction_reference: null,
        verified_by: null,
        verified_at: null,
        items: orderDetails.items,
        demoPaymentsEnabled: true,
      };
    } else if (path.endsWith("/menu")) {
      body = [{
        id: "responsive-test-product",
        name: "Seasonal Fruit Bowl",
        description: "Fresh seasonal fruit prepared to order.",
        category: "Fruit Bowls",
        image: null,
        availabilityStatus: "AVAILABLE",
        featured: false,
        archived: false,
        variants: [{ size: "Regular", price: 250 }],
      }];
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function seedCustomerSession(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "fruits-and-roots-cart",
      JSON.stringify([{
        id: "responsive-test-product",
        name: "Seasonal Fruit Bowl",
        size: "Regular",
        price: 250,
        quantity: 1,
      }]),
    );
    window.sessionStorage.setItem(
      "fruits-roots-order-token:responsive-test-order",
      "responsive-test-token",
    );
  });
}

async function expectNoHorizontalOverflow(page: Page, route: string) {
  const measurement = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const scrollContainer = element.closest(
          '[style*="overflow-x"], .overflow-x-auto, .overflow-x-scroll',
        );
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string"
            ? element.className.slice(0, 100)
            : "",
          text: (element.textContent ?? "").trim().slice(0, 50),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflowX: style.overflowX,
          containedByHorizontalScroller: Boolean(scrollContainer),
        };
      })
      .filter((element) =>
        element.width > 0 &&
        (element.left < -1 ||
          element.right > viewportWidth + 1 ||
          element.scrollWidth > element.clientWidth + 1)
      )
      .slice(0, 8);

    return {
      clientWidth: viewportWidth,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      visualViewportWidth: window.visualViewport?.width,
      nav: (() => {
        const element = document.querySelector('[aria-label="Mobile navigation"]');
        if (!element) return null;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          width: style.width,
          maxWidth: style.maxWidth,
          left: style.left,
          right: style.right,
          rectWidth: rect.width,
        };
      })(),
      offenders,
    };
  });

  expect(
    measurement.scrollWidth,
    `${route} overflows horizontally: ${JSON.stringify(measurement)}`,
  ).toBeLessThanOrEqual(measurement.clientWidth + 1);
}

for (const viewport of viewports) {
  test(`all customer and admin routes fit at ${viewport.width}px`, async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "The viewport matrix creates its own Chromium contexts.",
    );
    test.setTimeout(120_000);
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width <= 430,
      hasTouch: viewport.width <= 430,
    });
    await mockAdminReadApis(context);
    const page = await context.newPage();
    await seedCustomerSession(page);

    const routes = [
      "/",
      "/menu",
      "/product/responsive-test-product",
      "/product/responsive-long-product",
      "/cart",
      "/checkout",
      "/payment/responsive-test-order",
      "/order/responsive-test-order",
      "/admin/login",
      "/admin",
      "/admin/orders",
      "/admin/orders/responsive-test-order",
      "/admin/menu",
      "/admin/tables",
      "/admin/reports",
      "/admin/settings",
    ];

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(100);
      await expectNoHorizontalOverflow(page, route);
      if (route === "/menu") {
        await expect(page.getByRole("heading", { name: "Explore Our Menu" })).toBeVisible();
        await page.getByRole("button", { name: "Fruit Bowls", exact: true }).click();
      } else if (route === "/product/responsive-test-product") {
        await expect(page.getByRole("heading", { name: "Seasonal Fruit Bowl" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Add to Cart" })).toBeVisible();
      } else if (route === "/cart") {
        await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible();
      } else if (route === "/checkout") {
        await expect(page.getByLabel("Your name")).toBeVisible();
        await expect(page.getByLabel(/Phone number/)).toBeVisible();
      } else if (route === "/payment/responsive-test-order") {
        await expect(page.getByRole("heading", { name: "Complete Your Payment" })).toBeVisible();
      } else if (route === "/order/responsive-test-order") {
        await expect(page.getByRole("heading", { name: "Your order is in" })).toBeVisible();
      } else if (route === "/admin/login") {
        await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
      } else if (route === "/admin") {
        await expect(page.getByRole("region", { name: "Order statistics" }).locator("article")).toHaveCount(6);
      } else if (route === "/admin/orders/responsive-test-order") {
        await expect(page.getByRole("button", { name: "Move to READY" })).toBeVisible();
      } else if (route === "/admin/menu") {
        await expect(page.getByRole("link", { name: "Orders" })).toBeVisible();
      }
    }

    if (viewport.width <= 430) {
      await page.goto("/product/responsive-test-product");
      await page.getByRole("button", { name: "Add to Cart" }).click();
      await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible();
      await expectNoHorizontalOverflow(page, "/cart after add to cart");

      await page.goto("/cart");
      await page.getByRole("button", {
        name: "Increase Seasonal Fruit Bowl quantity",
      }).click();
      await expectNoHorizontalOverflow(page, "/cart after quantity update");

      await page.goto("/admin/menu");
      await page.getByRole("button", { name: "Add New Item" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoHorizontalOverflow(page, "/admin/menu editor");
    }

    await context.close();
  });
}
