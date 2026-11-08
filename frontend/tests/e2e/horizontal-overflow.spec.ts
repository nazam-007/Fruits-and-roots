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
    tags: ["Seasonal Recommendation With A Long Mobile Badge"],
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
    tags: ["Most Loved"],
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
    } else if (path.endsWith("/tags")) {
      body = [];
    } else if (path.endsWith("/categories")) {
      body = [{ id: "00000000-0000-4000-8000-000000000001", name: "Fruit Bowls", sortOrder: 0 }];
    } else if (path.endsWith("/dashboard")) {
      body = {
        summary: {
          total_orders: 1,
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
        tags: [],
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

test("dynamic product tags remain visible without mobile overflow", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockAdminReadApis(context);
  const page = await context.newPage();

  await page.goto("/menu");
  await expect(page.getByText("Seasonal Recommendation With A Long Mobile Badge")).toBeVisible();
  await expectNoHorizontalOverflow(page, "/menu with product tags at 320px");

  await page.goto("/product/responsive-test-product");
  await expect(page.getByText("Seasonal Recommendation With A Long Mobile Badge")).toBeVisible();
  await expectNoHorizontalOverflow(page, "/product with product tags at 320px");

  await context.close();
});

test("category deep links and product details preserve the selected size", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockAdminReadApis(context);
  const page = await context.newPage();

  await page.goto("/menu?category=fruit-bowls");
  await expect(page.getByRole("button", { name: "Fruit Bowls", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "View Seasonal Fruit Bowl" }).click();
  await page.getByRole("button", { name: "Large — ₹350" }).click();
  await page.getByRole("button", { name: "Add to Cart" }).last().click();
  await expect(page.getByText("Large size")).toBeVisible();
  await expect(page.getByLabel("Cart total")).toContainText("350");

  await page.getByRole("link", { name: /Keep browsing/ }).click();
  await page.getByRole("link", { name: "View Seasonal Fruit Bowl" }).click();
  await page.getByRole("button", { name: "Add to Cart" }).click();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Seasonal Fruit Bowl" }))
    .toBeVisible();

  await context.close();
});

test("card size selection is modal on mobile, keyboard accessible, and confirms price", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockAdminReadApis(context);
  const page = await context.newPage();

  await page.goto("/menu?category=fruit-bowls");
  const productCard = page.locator(".menu-product-card").first();
  await expect(productCard.getByRole("group", { name: /Available sizes/ }))
    .toHaveCount(0);

  const addButton = productCard.getByRole("button", {
    name: "Add Seasonal Fruit Bowl to cart",
  });
  await addButton.click();
  const dialog = page.getByRole("dialog", {
    name: "Seasonal Fruit Bowl",
  });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(220);
  const sheetBounds = await dialog.boundingBox();
  expect(sheetBounds).not.toBeNull();
  expect(Math.abs(sheetBounds!.y + sheetBounds!.height - 844))
    .toBeLessThanOrEqual(2);
  await expect(dialog.getByRole("button", { name: "Regular ₹250" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Large ₹350" }))
    .toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }))
    .not.toContainText("1");

  await page.mouse.click(10, 100);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }))
    .not.toContainText("1");

  await addButton.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(addButton).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }))
    .not.toContainText("1");

  await addButton.click();
  await dialog.getByRole("button", { name: "Large ₹350" }).click();
  await dialog.getByRole("button", { name: "Add · ₹350" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }))
    .toContainText("1");
  await expect(addButton).toBeFocused();

  const singleSizeCard = page.locator(".menu-product-card").nth(1);
  await expect(singleSizeCard.getByRole("group", { name: /Available sizes/ }))
    .toHaveCount(0);
  await singleSizeCard.getByRole("button", {
    name: /Add ProductNameWithoutSpaces/,
  }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }))
    .toContainText("2");

  await page.goto("/cart");
  await expect(page.getByText("Large size")).toBeVisible();
  await expect(page.getByLabel("Cart total")).toContainText("600");

  await context.close();
});

test("card size selection uses a centered desktop dialog", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await mockAdminReadApis(context);
  const page = await context.newPage();

  await page.goto("/menu?category=fruit-bowls");
  await page.locator(".menu-product-card").first()
    .getByRole("button", { name: "Add Seasonal Fruit Bowl to cart" })
    .click();

  const dialog = page.getByRole("dialog", { name: "Seasonal Fruit Bowl" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("dialog:modal")).toHaveCount(1);
  await page.waitForTimeout(220);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(Math.abs(bounds!.x + bounds!.width / 2 - 720)).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds!.y + bounds!.height / 2 - 450)).toBeLessThanOrEqual(1);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await context.close();
});

test("restaurant paused and closed states stay clear on the menu", async ({
  browser,
}) => {
  const openingHours = Object.fromEntries(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
      .map((day) => [
        day,
        { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
      ]),
  );
  for (const [status, expectedLabel] of [
    ["CLOSED", "Closed Now"],
    ["PAUSED", "Temporarily Not Accepting Orders"],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await mockAdminReadApis(context);
    await context.route("**/api/menu/status", async (route) => {
      await route.fulfill({
        json: {
          acceptingOrders: false,
          openingHours,
          updatedAt: "2026-11-07T09:00:00.000Z",
          orderingAvailable: false,
          status,
          isScheduledOpen: status === "CLOSED",
          nextOpenAt: status === "CLOSED" ? "2026-11-08T03:30:00.000Z" : null,
          timeZone: "Asia/Kolkata",
        },
      });
    });
    const page = await context.newPage();

    await page.goto("/menu");
    await expect(page.getByText(expectedLabel)).toBeVisible();
    if (status === "CLOSED") {
      await expect(page.getByText(/Opens next:/)).toBeVisible();
    }

    await context.close();
  }
});

test("pending payment cancellation returns the customer to the cart", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockAdminReadApis(context);
  await seedCustomerSession(await context.newPage());
  await context.route("**/api/orders/responsive-test-order", async (route) => {
    await route.fulfill({
      json: {
        ...orderDetails,
        orderStatus: "PENDING_PAYMENT",
        paymentStatus: "PENDING_PAYMENT",
      },
    });
  });
  await context.route(
    "**/api/orders/responsive-test-order/payment-cancel",
    async (route) => {
      await route.fulfill({ json: { orderId: orderDetails.orderId, paymentStatus: "CANCELLED" } });
    },
  );
  const page = context.pages()[0];

  await page.goto("/payment/responsive-test-order");
  await expect(page.getByRole("status")).toContainText("QR code unavailable");
  await page.getByRole("button", { name: "Cancel Payment · Back to Cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible();

  await context.close();
});

test("reduced motion preference softens customer animations", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await mockAdminReadApis(context);
  const page = await context.newPage();

  await page.goto("/menu");
  const animationDuration = await page.locator(".menu-product-card").first()
    .evaluate((element) => {
      const duration = window.getComputedStyle(element).animationDuration;
      return Number.parseFloat(duration);
    });
  expect(animationDuration).toBeLessThan(0.001);

  await context.close();
});

test("browser back restores the menu scroll position", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockAdminReadApis(context);
  const page = await context.newPage();

  await page.goto("/menu");
  await page.evaluate(() => window.scrollTo(0, 500));
  const menuScrollY = await page.evaluate(() => window.scrollY);
  await page.locator(".menu-product-card").first().locator("a").first().click();
  await expect(page.getByRole("heading", { name: "Seasonal Fruit Bowl" }))
    .toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Explore Our Menu" }))
    .toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(menuScrollY - 10);

  await context.close();
});

test("mobile checkout actions yield space to a short keyboard viewport", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 480 },
    isMobile: true,
    hasTouch: true,
  });
  await mockAdminReadApis(context);
  const page = await context.newPage();
  await seedCustomerSession(page);

  await page.goto("/checkout");
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.locator(".mobile-sticky-action")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }))
    .toBeHidden();

  await context.close();
});

test("product cards, featured heading, and images stay stable across viewport sizes", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockAdminReadApis(context);
  await context.route("**/api/menu/status", async (route) => {
    await route.fulfill({
      json: {
        acceptingOrders: true,
        openingHours: Object.fromEntries(
          ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            .map((day) => [
              day,
              { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
            ]),
        ),
        updatedAt: "2026-11-07T09:00:00.000Z",
        orderingAvailable: true,
        status: "OPEN",
        isScheduledOpen: true,
        nextOpenAt: null,
        timeZone: "Asia/Kolkata",
      },
    });
  });
  await context.route("**/api/menu", async (route) => {
    await route.fulfill({
      json: customerMenu.map((item, index) => ({
        ...item,
        image: index === 0
          ? "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=900&q=85"
          : item.image,
      })),
    });
  });
  await context.route("https://images.unsplash.com/**", async (route) => {
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="100%" height="100%" fill="#e9eddf"/></svg>',
    });
  });
  const page = await context.newPage();

  for (const width of [320, 360, 375, 390, 414, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: width <= 375 ? 667 : 844 });
    await page.goto("/menu");
    const cards = page.locator(".menu-product-card");
    await expect(cards.first()).toBeVisible();
    const searchLeft = await page.getByRole("searchbox", {
      name: "Search menu items",
    }).evaluate((element) => element.getBoundingClientRect().left);
    const categoryLeft = await page.getByRole("button", {
      name: "All Items",
    }).evaluate((element) => element.getBoundingClientRect().left);
    expect(Math.abs(searchLeft - categoryLeft)).toBeLessThanOrEqual(1);
    const cardMetrics = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const card = element.getBoundingClientRect();
        const image = element.querySelector("a[aria-label^='View']")?.getBoundingClientRect();
        const action = element.querySelector("button[aria-label^='Add']")?.getBoundingClientRect();
        const price = element.querySelector('[aria-label="Starting price"], [aria-label="Price"]')?.getBoundingClientRect();
        return {
          top: Math.round(card.top),
          height: Math.round(card.height),
          right: Math.round(card.right),
          imageRatio: image ? image.width / image.height : null,
          imageBottom: image ? Math.round(image.bottom) : null,
          priceTop: price ? Math.round(price.top) : null,
          actionBottom: action ? Math.round(action.bottom) : null,
        };
      }),
    );

    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 1);
    const startingPrice = cards.nth(0).getByLabel("Starting price");
    await expect(startingPrice).toContainText("From");
    await expect(startingPrice).toContainText("₹250");
    const priceStyle = await startingPrice.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        fontWeight: Number(style.fontWeight),
        color: style.color,
      };
    });
    expect(priceStyle.fontSize).toBe("18px");
    expect(priceStyle.fontWeight).toBeGreaterThanOrEqual(600);
    expect(priceStyle.color).toBe("rgb(49, 87, 58)");
    await expect(cards.nth(1).getByLabel("Price")).toHaveText("₹250");
    for (let index = 0; index < cardMetrics.length; index += 2) {
      const row = cardMetrics.slice(index, index + 2);
      if (row.length === 2 && row[0].top === row[1].top) {
        expect(Math.abs(row[0].height - row[1].height)).toBeLessThanOrEqual(1);
        const expectedImageRatio = width < 640 ? 3 / 2 : 4 / 3;
        expect(Math.abs(row[0].imageRatio! - expectedImageRatio)).toBeLessThan(0.02);
        expect(Math.abs(row[0].priceTop! - row[1].priceTop!)).toBeLessThanOrEqual(1);
        expect(Math.abs(row[0].actionBottom! - row[1].actionBottom!))
          .toBeLessThanOrEqual(1);
      }
    }

    const firstImage = cards.first().locator("img");
    await expect(firstImage).toHaveAttribute("loading", "eager");
    await expect(firstImage).toHaveAttribute("srcset", /320w.*480w.*640w/);
    await expect(firstImage).toHaveAttribute("sizes", /50vw/);
    await expect(cards.nth(0).getByRole("group", { name: /Available sizes/ }))
      .toHaveCount(0);
    await expect(cards.nth(1).getByRole("group", { name: /Available sizes/ }))
      .toHaveCount(0);
    await expect(cards.nth(1).getByRole("button", { name: /Add .* to cart/ }))
      .toBeVisible();
  }

  await page.goto("/");
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("heading", { name: "A few good picks" }).scrollIntoViewIfNeeded();
    const heading = await page.getByRole("heading", { name: "A few good picks" }).boundingBox();
    const seeAll = await page.getByRole("link", { name: /See all/ }).boundingBox();
    expect(heading).not.toBeNull();
    expect(seeAll).not.toBeNull();
    expect(heading!.x + heading!.width).toBeLessThanOrEqual(seeAll!.x + 1);
    expect(heading!.height).toBeLessThan(width < 640 ? 42 : 48);
  }

  await context.close();
});

test("cart totals remain above the fixed checkout action and quantity stays responsive", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockAdminReadApis(context);
  const page = await context.newPage();
  await seedCustomerSession(page);

  for (const width of [320, 360, 375, 390, 414, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: width <= 375 ? 667 : 844 });
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible();
    const total = page.getByLabel("Cart total");
    const totalBefore = Number((await total.innerText()).replace(/[^\d]/g, ""));
    await page.getByRole("button", {
      name: "Increase Seasonal Fruit Bowl quantity",
    }).click();
    await expect(total).toContainText(String(totalBefore + 250));
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 1);

    if (width <= 430) {
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      const geometry = await page.evaluate(() => {
        const action = document.querySelector(".mobile-sticky-action")?.getBoundingClientRect();
        const nav = document.querySelector('[aria-label="Mobile navigation"]')?.getBoundingClientRect();
        const total = document.querySelector('[aria-label="Cart total"]')?.getBoundingClientRect();
        return { action, nav, total };
      });
      expect(geometry.action).not.toBeUndefined();
      expect(geometry.nav).not.toBeUndefined();
      expect(geometry.total).not.toBeUndefined();
      expect(Math.abs(geometry.action!.bottom - geometry.nav!.top)).toBeLessThanOrEqual(1);
      expect(geometry.total!.bottom).toBeLessThanOrEqual(geometry.action!.top);
    }
  }

  await context.close();
});

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
        await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
      } else if (route === "/order/responsive-test-order") {
        await expect(page.getByRole("heading", { name: "Your order is in" })).toBeVisible();
      } else if (route === "/admin/login") {
        await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
      } else if (route === "/admin") {
        const statistics = page.getByRole("region", { name: "Order statistics" });
        await expect(statistics.locator("article")).toHaveCount(7);
        await expect(statistics.getByRole("link", { name: /Cancelled/ })).toBeVisible();
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
