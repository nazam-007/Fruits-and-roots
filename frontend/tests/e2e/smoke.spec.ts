import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const apiBaseURL = "http://127.0.0.1:5191";
const menuEndpoint = `${apiBaseURL}/api/menu`;
const allDaySchedule = {
  monday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  tuesday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  wednesday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  thursday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  friday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  saturday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  sunday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
};

function restaurantStatus(acceptingOrders: boolean, openingHours = allDaySchedule) {
  const status = acceptingOrders ? "OPEN" : "PAUSED";
  return {
    acceptingOrders,
    openingHours,
    updatedAt: "2026-11-07T09:00:00.000Z",
    orderingAvailable: status === "OPEN",
    status,
    isScheduledOpen: true,
    nextOpenAt: null,
    timeZone: "Asia/Kolkata",
  };
}

type MenuProduct = {
  id: string;
  categoryId?: string;
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

async function mockAcceptingOrders(page: Page) {
  await page.route(`${apiBaseURL}/api/menu/status`, async (route) => {
    await route.fulfill({
      json: {
        ...restaurantStatus(true),
      },
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  for (const width of [320, 360, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      { message: `page should not overflow horizontally at ${width}px` },
    ).toBe(true);
  }
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

test("customer category filters use visible database menu products", async ({ page }) => {
  const drink: MenuProduct = {
    id: "drink-item",
    categoryId: "00000000-0000-4000-8000-000000000001",
    name: "Fresh Juice",
    category: "Drinks",
    available: true,
    availabilityStatus: "AVAILABLE",
    variants: [{ size: "Regular", price: 100 }],
  };
  const food: MenuProduct = {
    id: "food-item",
    categoryId: "00000000-0000-4000-8000-000000000002",
    name: "Seasonal Bowl",
    category: "Food",
    available: true,
    availabilityStatus: "AVAILABLE",
    variants: [{ size: "Regular", price: 150 }],
  };
  let foodAdded = false;
  await page.route(menuEndpoint, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(foodAdded ? [drink, food] : [drink]),
    });
  });

  await page.goto("/menu");
  await expect(page.getByRole("button", { name: "All Items" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drinks", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Food", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Liquid Therapy", exact: true })).toHaveCount(0);

  foodAdded = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("button", { name: "Food", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await expect(page.getByRole("link", { name: "View Seasonal Bowl" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View Fresh Juice" })).toHaveCount(0);

  foodAdded = false;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("button", { name: "All Items" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectNoHorizontalOverflow(page);
});

test("customer menu refreshes immediately after a catalog event", async ({ page }) => {
  const product: MenuProduct = {
    id: "catalog-event-item",
    categoryId: "00000000-0000-4000-8000-000000000001",
    name: "Seasonal Citrus",
    category: "Juices",
    available: true,
    availabilityStatus: "AVAILABLE",
    variants: [{ size: "Regular", price: 120 }],
  };
  let productAvailable = true;
  let releaseCatalogEvent!: () => void;
  const catalogEventReady = new Promise<void>((resolve) => {
    releaseCatalogEvent = resolve;
  });
  await page.route(menuEndpoint, async (route) => {
    await route.fulfill({ json: productAvailable ? [product] : [] });
  });
  await page.route("**/api/menu/events", async (route) => {
    await catalogEventReady;
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: "retry: 10000\n\nevent: catalog-changed\ndata: {}\n\n",
    });
  });

  await page.goto("/menu");
  const productLink = page.getByRole("link", { name: "View Seasonal Citrus" });
  await expect(productLink).toBeVisible();
  productAvailable = false;
  releaseCatalogEvent();
  await expect(productLink).toHaveCount(0, { timeout: 2_000 });
});

test("restaurant ordering status disables checkout without clearing the cart", async ({
  page,
}) => {
  const product: MenuProduct = {
    id: "ordering-state-item",
    categoryId: "00000000-0000-4000-8000-000000000001",
    name: "Order State Juice",
    category: "Juices",
    available: true,
    availabilityStatus: "AVAILABLE",
    variants: [{ size: "Regular", price: 130 }],
  };
  let acceptingOrders = true;
  let releaseStatusEvent!: () => void;
  const statusEventReady = new Promise<void>((resolve) => {
    releaseStatusEvent = resolve;
  });
  await page.route(menuEndpoint, async (route) => {
    await route.fulfill({ json: [product] });
  });
  await page.route(`${apiBaseURL}/api/menu/status`, async (route) => {
    await route.fulfill({
      json: {
        ...restaurantStatus(acceptingOrders),
      },
    });
  });
  await page.route("**/api/menu/events", async (route) => {
    await statusEventReady;
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: "retry: 10000\n\nevent: restaurant-status-changed\ndata: {}\n\n",
    });
  });
  await seedCart(page, product);

  await page.goto("/menu");
  await expect(page.getByText("Open Now")).toBeVisible();
  await page.goto("/checkout");
  await expect(
    page.getByRole("button", { name: /Continue to Payment/ }).first(),
  ).toBeEnabled();

  acceptingOrders = false;
  releaseStatusEvent();
  await expect(
    page.getByText("The restaurant is temporarily not accepting orders. Your cart is saved."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue to Payment/ }).first(),
  ).toBeDisabled();
  await expect.poll(() =>
    page.evaluate(() => JSON.parse(localStorage.getItem("fruits-and-roots-cart") ?? "[]")),
  ).toMatchObject([{ id: product.id, quantity: 1 }]);

  await page.goto("/menu");
  await expect(page.getByText("Temporarily Not Accepting Orders")).toBeVisible();
});

test("admin can pause and resume ordering without optimistic state on failure", async ({
  page,
}) => {
  let acceptingOrders = true;
  let openingHours = allDaySchedule;
  let failNextUpdate = true;
  await page.route(`${apiBaseURL}/api/menu/status`, async (route) => {
    await route.fulfill({
      json: {
        ...restaurantStatus(acceptingOrders, openingHours),
      },
    });
  });
  await page.route("**/api/menu/events", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: "",
    });
  });
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/auth/session") {
      await route.fulfill({ json: { adminId: "test-admin" } });
      return;
    }
    if (url.pathname === "/api/admin/dashboard") {
      await route.fulfill({
        json: {
          summary: {
            total_orders: 0,
            total_orders_today: 0,
            new_orders: 0,
            preparing_orders: 0,
            ready_orders: 0,
            completed_orders: 0,
            cancelled_orders: 0,
            verified_revenue_today: 0,
            demo_revenue_today: 0,
          },
          demoPaymentsEnabled: false,
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/orders") {
      await route.fulfill({
        json: {
          items: [],
          orders: [],
          page: 1,
          total: 0,
          totalPages: 0,
          counts: {
            ALL: 0,
            PLACED: 0,
            PREPARING: 0,
            READY: 0,
            COMPLETED: 0,
            CANCELLED: 0,
          },
          limit: 25,
          offset: 0,
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/restaurant/settings") {
      if (request.method() === "GET") {
        await route.fulfill({
          json: {
            ...restaurantStatus(acceptingOrders, openingHours),
          },
        });
        return;
      }
      if (failNextUpdate) {
        failNextUpdate = false;
        await route.fulfill({
          status: 503,
          json: { message: "Unable to update restaurant ordering settings." },
        });
        return;
      }
      const body = request.postDataJSON();
      if (typeof body.acceptingOrders === "boolean") {
        acceptingOrders = body.acceptingOrders;
      }
      if (body.openingHours) openingHours = body.openingHours;
      await route.fulfill({
        json: restaurantStatus(acceptingOrders, openingHours),
      });
      return;
    }
    await route.fulfill({ status: 404, json: { message: "Not mocked." } });
  });

  await page.goto("/admin");
  const toggle = page.getByRole("switch", { name: "Accepting Orders" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  await page.once("dialog", (dialog) => dialog.accept());
  await toggle.click();
  await expect(page.getByRole("alert")).toContainText(
    "Unable to update restaurant ordering settings.",
  );
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  await page.once("dialog", (dialog) => dialog.accept());
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("New orders are paused.")).toBeVisible();

  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Opening Hours" })).toBeVisible();
  const monday = page.locator("fieldset").filter({ hasText: "Monday" });
  await monday.getByRole("checkbox").first().uncheck();
  const tuesday = page.locator("fieldset").filter({ hasText: "Tuesday" });
  await tuesday.getByRole("checkbox").nth(1).uncheck();
  await expect(tuesday.getByLabel("Opens")).toHaveValue("09:00");
  await expect(tuesday.getByLabel("Closes")).toHaveValue("17:00");
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(page.getByText("Opening hours saved.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(acceptingOrders).toBe(false);
});

test("customer menu shows closed status and the next scheduled opening", async ({ page }) => {
  const schedule = {
    ...allDaySchedule,
    monday: { ...allDaySchedule.monday, isOpen: false },
  };
  await page.route(`${apiBaseURL}/api/menu/status`, async (route) => {
    await route.fulfill({
      json: {
        ...restaurantStatus(true, schedule),
        status: "CLOSED",
        orderingAvailable: false,
        isScheduledOpen: false,
        nextOpenAt: "2026-11-10T04:30:00.000Z",
      },
    });
  });
  await page.route("**/api/menu/events", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: "",
    });
  });
  await page.goto("/menu");
  await expect(page.getByText("Closed Now")).toBeVisible();
  await expect(page.getByText(/Opens next:/)).toContainText("IST");
});

test("admin category creation is assignable to a product using mocked APIs", async ({
  page,
}) => {
  const categories = [
    { id: "00000000-0000-4000-8000-000000000001", name: "Drinks", sortOrder: 0 },
  ];
  const products: Array<Record<string, unknown>> = [];
  await page.route(menuEndpoint, async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/auth/session" && request.method() === "GET") {
      await route.fulfill({ json: { adminId: "test-admin" } });
      return;
    }
    if (url.pathname === "/api/admin/tags" && request.method() === "GET") {
      await route.fulfill({ json: [] });
      return;
    }
    if (url.pathname === "/api/admin/categories" && request.method() === "GET") {
      await route.fulfill({
        json: [...categories].sort((left, right) => left.sortOrder - right.sortOrder),
      });
      return;
    }
    if (url.pathname === "/api/admin/menu" && request.method() === "GET") {
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      await route.fulfill({
        json: products.filter((product) => includeArchived || product.archived !== true),
      });
      return;
    }
    if (/^\/api\/admin\/menu\/[^/]+$/.test(url.pathname) && request.method() === "DELETE") {
      const productId = url.pathname.split("/").at(-1);
      const product = products.find((item) => item.id === productId);
      if (!product) {
        await route.fulfill({ status: 404, json: { message: "Menu item not found." } });
        return;
      }
      if (product.orderCount) {
        product.archived = true;
        await route.fulfill({
          json: {
            deleted: false,
            archived: true,
            message: `${product.name} was removed from the active menu. Historical orders have been retained.`,
          },
        });
        return;
      }
      products.splice(products.indexOf(product), 1);
      await route.fulfill({
        json: { deleted: true, archived: false, message: `${product.name} was deleted.` },
      });
      return;
    }
    if (url.pathname === "/api/admin/categories" && request.method() === "POST") {
      const { name } = request.postDataJSON() as { name: string };
      if (categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
        await route.fulfill({
          status: 409,
          json: { message: "A category with this name already exists." },
        });
        return;
      }
      const category = {
        id: "00000000-0000-4000-8000-000000000002",
        name,
        sortOrder: categories.length,
      };
      categories.push(category);
      await route.fulfill({ status: 201, json: category });
      return;
    }
    if (/^\/api\/admin\/categories\/[0-9a-f-]+$/i.test(url.pathname) && request.method() === "PATCH") {
      const categoryId = url.pathname.split("/").at(-1);
      const { name } = request.postDataJSON() as { name: string };
      if (categories.some((category) => category.id !== categoryId && category.name.toLowerCase() === name.toLowerCase())) {
        await route.fulfill({
          status: 409,
          json: { message: "A category with this name already exists." },
        });
        return;
      }
      const category = categories.find((item) => item.id === categoryId);
      if (!category) {
        await route.fulfill({ status: 404, json: { message: "Category not found." } });
        return;
      }
      category.name = name;
      for (const product of products) {
        if (product.categoryId === category.id) product.category = name;
      }
      await route.fulfill({ json: category });
      return;
    }
    if (url.pathname === "/api/admin/categories/order" && request.method() === "PUT") {
      const { categoryIds } = request.postDataJSON() as { categoryIds: string[] };
      if (
        categoryIds.length !== categories.length ||
        new Set(categoryIds).size !== categories.length ||
        categories.some((category) => !categoryIds.includes(category.id))
      ) {
        await route.fulfill({ status: 409, json: { message: "Category list changed." } });
        return;
      }
      categoryIds.forEach((id, sortOrder) => {
        const category = categories.find((item) => item.id === id);
        if (category) category.sortOrder = sortOrder;
      });
      await route.fulfill({
        json: [...categories].sort((left, right) => left.sortOrder - right.sortOrder),
      });
      return;
    }
    if (/^\/api\/admin\/categories\/[0-9a-f-]+$/i.test(url.pathname) && request.method() === "DELETE") {
      const categoryId = url.pathname.split("/").at(-1);
      const productCount = products.filter((product) => product.categoryId === categoryId).length;
      if (productCount > 0) {
        await route.fulfill({
          status: 409,
          json: { message: `Cannot delete Healthy Food because ${productCount} product is assigned to it.` },
        });
        return;
      }
      const index = categories.findIndex((category) => category.id === categoryId);
      if (index >= 0) categories.splice(index, 1);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (url.pathname === "/api/admin/menu" && request.method() === "POST") {
      const input = request.postDataJSON() as Record<string, unknown>;
      const category = categories.find((item) => item.name === input.category);
      const product = {
        id: String(input.name).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        categoryId: category?.id,
        ...input,
        tags: [],
        archived: false,
        orderCount: input.name === "Seasonal Bowl" ? 1 : 0,
        variants: [
          { size: "Regular", price: input.regularPrice },
          ...(input.largePrice === null
            ? []
            : [{ size: "Large", price: input.largePrice }]),
        ],
      };
      products.push(product);
      await route.fulfill({ status: 201, json: product });
      return;
    }
    await route.fulfill({ status: 404, json: { message: "Not mocked." } });
  });

  await page.goto("/admin/menu");
  await expect(page.getByRole("heading", { name: "Menu Management" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand categories" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByRole("button", { name: "Add Category" }).click();
  await expect(page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).resolves.toBeTruthy();
  await page.getByLabel("Category name *").fill("  Food  ");
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(page.getByRole("status")).toContainText('Category "Food" created.');
  await expect(page.locator("select").first()).toHaveValue("Food");
  await expect(page.getByRole("button", { name: "Collapse categories" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  const categoryList = page.getByRole("region", { name: "Categories" }).locator("li");
  await page.getByRole("button", { name: "Collapse categories" }).click();
  await expect(page.locator("#admin-category-list")).toBeHidden();
  await page.getByRole("button", { name: "Expand categories" }).click();
  await page.getByRole("button", { name: "Move Food up" }).click();
  await expect(categoryList.first()).toContainText("Food");
  await page.reload();
  await page.getByRole("button", { name: "Expand categories" }).click();
  await expect(page.getByRole("button", { name: "Move Food up" })).toBeDisabled();

  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByLabel("Category name *").fill("fOoD");
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Add New Item" }).click();
  const editor = page.getByRole("dialog", { name: "Add a menu item" });
  await expect(page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).resolves.toBeTruthy();
  await expect(editor.getByLabel("Category *")).toHaveValue("Food");
  await editor.getByLabel("Product name *").fill("Seasonal Bowl");
  await editor.getByLabel("Regular price (₹) *").fill("150");
  await editor.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByText("Seasonal Bowl", { exact: true })).toBeVisible();
  await expect(
    page.locator("article").filter({ hasText: "Seasonal Bowl" }).getByText("Food", { exact: true }),
  ).toBeVisible();

  const foodCategoryRow = page.getByRole("region", { name: "Categories" }).getByRole("listitem").filter({ hasText: "Food" });
  await foodCategoryRow.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Category name *").fill("   ");
  await page.getByRole("button", { name: "Save Name" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a category name");
  await page.getByLabel("Category name *").fill("Drinks");
  await page.getByRole("button", { name: "Save Name" }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await page.getByLabel("Category name *").fill("Healthy Food");
  await page.getByRole("button", { name: "Save Name" }).click();
  await expect(page.getByRole("status")).toContainText('Category renamed to "Healthy Food".');
  await expect(
    page.locator("article").filter({ hasText: "Seasonal Bowl" }).getByText("Healthy Food", { exact: true }),
  ).toBeVisible();

  const productCard = page.locator("article").filter({ hasText: "Seasonal Bowl" });
  await expect(productCard.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(productCard.getByRole("button", { name: "Archive" })).toBeVisible();
  await expect(productCard.getByRole("button", { name: "Delete" })).toBeVisible();
  await productCard.getByRole("button", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete Seasonal Bowl?" });
  await expect(deleteDialog).toContainText("historical order details are retained");
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(productCard).toBeVisible();

  await productCard.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete Seasonal Bowl?" })
    .getByRole("button", { name: "Delete Item" }).click();
  await expect(page.getByRole("status")).toContainText("Historical orders have been retained.");
  await expect(page.locator("article").filter({ hasText: "Seasonal Bowl" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Move Healthy Food up" })).toBeVisible();
  await page.getByLabel("Include archived items").check();
  await expect(page.locator("article").filter({ hasText: "Seasonal Bowl" })).toContainText("Archived");

  await page.getByLabel("Include archived items").uncheck();
  await page.getByRole("button", { name: "Add New Item" }).click();
  const secondEditor = page.getByRole("dialog", { name: "Add a menu item" });
  await secondEditor.getByLabel("Product name *").fill("Unordered Juice");
  await secondEditor.getByLabel("Regular price (₹) *").fill("95");
  await secondEditor.getByRole("button", { name: "Add Item" }).click();
  const unorderedCard = page.locator("article").filter({ hasText: "Unordered Juice" });
  await expect(unorderedCard).toBeVisible();
  await unorderedCard.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete Unordered Juice?" })
    .getByRole("button", { name: "Delete Item" }).click();
  await expect(page.getByRole("status")).toContainText("Unordered Juice was deleted.");
  await expect(unorderedCard).toHaveCount(0);

  await page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("region", { name: "Categories" }).getByRole("listitem")
    .filter({ hasText: "Healthy Food" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("alert")).toContainText("1 product is assigned to it");

  await page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("region", { name: "Categories" }).getByRole("listitem")
    .filter({ hasText: "Drinks" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("region", { name: "Categories" }).getByText("Drinks")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectNoHorizontalOverflow(page);
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
  await mockAcceptingOrders(page);
  await page.goto("/checkout");

  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByLabel(/Phone number/)).toBeVisible();
  await expect(page.getByLabel(/Phone number/)).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Continue to Payment" }).first(),
  ).toBeEnabled();
});

test("checkout submits Takeaway by default and optional Dine-in table number", async ({
  page,
  request,
}) => {
  const products = await loadMenu(request);
  const product = products.find((item) => item.available && item.variants.length);
  expect(product, "menu should contain an available product").toBeTruthy();
  await seedCart(page, product!);
  await mockAcceptingOrders(page);

  const submittedOrders: Array<Record<string, unknown>> = [];
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    submittedOrders.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Order intercepted for this test." }),
    });
  });

  await page.goto("/checkout");
  await page.getByLabel("Your name").fill("Test Customer");
  await expect(page.getByRole("radio", { name: /Takeaway/ })).toBeChecked();
  await page.getByRole("button", { name: "Continue to Payment" }).first().click();
  await expect.poll(() => submittedOrders.length).toBe(1);
  expect(submittedOrders[0]).toMatchObject({ orderType: "TAKEAWAY" });
  expect(submittedOrders[0]).not.toHaveProperty("tableNumber");

  await page.getByText("Dine-in", { exact: true }).click();
  await page.getByLabel(/Table number/).fill("A2");
  await page.getByRole("button", { name: "Continue to Payment" }).first().click();
  await expect.poll(() => submittedOrders.length).toBe(2);
  expect(submittedOrders[1]).toMatchObject({
    orderType: "DINE_IN",
    tableNumber: "A2",
  });

  await page.getByLabel(/Table number/).fill("A-2");
  await page.getByRole("button", { name: "Continue to Payment" }).first().click();
  await expect(page.getByRole("alert")).toContainText("up to 6 letters or numbers");
  expect(submittedOrders).toHaveLength(2);
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
  let status: "PLACED" | "PREPARING" | "READY" | "COMPLETED" = "PLACED";
  let requestCount = 0;
  // Exercise polling fallback without an uncontrolled live SSE response.
  await page.route(`**/api/orders/${orderId}/events`, (route) => route.abort());
  await page.addInitScript(
    ({ id }) => {
      window.sessionStorage.setItem(`fruits-roots-order-token:${id}`, "test-tracking-token");
    },
    { id: orderId },
  );
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    const authorization = route.request().headers().authorization;
    expect(authorization).toBe("Bearer test-tracking-token");
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
  for (const [next, label] of [
    ["PREPARING", "Preparing"],
    ["READY", "Ready for pickup"],
    ["COMPLETED", "Completed"],
  ] as const) {
    status = next;
    await expectActiveStatus(label);
  }

  const completedRequestCount = requestCount;
  await page.waitForTimeout(2_500);
  expect(requestCount).toBe(completedRequestCount);
});

test("dashboard auto-refreshes all-time order count using mocked responses", async ({
  page,
}) => {
  let dashboardRequests = 0;
  let allOrders = 31;
  await page.route("**/api/admin/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ adminId: "e2e-admin" }),
    });
  });
  await page.route("**/api/admin/dashboard", async (route) => {
    dashboardRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: {
          total_orders: allOrders,
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
        items: [{
          id: "historical-order",
          order_number: "HIST-ORDER",
          customer_name: "Historical customer",
          customer_phone: null,
          fulfillment_type: "PICKUP",
          total_amount: 250,
          payment_status: "PAID",
          order_status: "CANCELLED",
          created_at: "2025-01-01T10:00:00.000Z",
          payment_source: null,
        }],
        total: allOrders,
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
  await expect(allOrdersCard.locator("p")).toHaveText("31");
  await expect(page.getByText("1–1 of 31")).toBeVisible();
  const todayOrdersCard = page.locator("article").filter({ hasText: "Orders today" }).first();
  await expect(todayOrdersCard).toContainText("1");
  allOrders = 32;
  await expect(allOrdersCard.locator("p")).toHaveText("32", { timeout: 5_000 });
  expect(dashboardRequests).toBeGreaterThanOrEqual(2);
});

test("dashboard does not show zero when the all-time count is missing", async ({
  page,
}) => {
  await mockAcceptingOrders(page);
  await page.route("**/api/admin/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ adminId: "e2e-admin" }),
    });
  });
  await page.route("**/api/admin/dashboard", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: {
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
  await expect(page.getByRole("alert").filter({
    hasText: "Dashboard response is missing the all-time order count.",
  })).toHaveText(
    "Dashboard response is missing the all-time order count.",
  );
  await expect(page.getByRole("alert")).toHaveCount(1);
  const allOrdersCard = page.locator("article").filter({ hasText: "All orders" }).first();
  await expect(allOrdersCard).toContainText("—");
  await expect(allOrdersCard).not.toContainText("0");
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
