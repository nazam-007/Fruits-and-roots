// Browser contract harness: real Express routes, deterministic read-only DB fixtures.
// Set these before importing dotenv/application code. Never use backend/.env's DB.
process.env.DATABASE_URL = "postgres://browser_fixture:unused@127.0.0.1:1/browser_fixture";
process.env.NODE_ENV = "test";
process.env.FRONTEND_ORIGIN = "http://127.0.0.1:5181";
process.env.DEMO_PAYMENTS_ENABLED = "false";
process.env.MERCHANT_UPI_ID = "fixture@invalid";
process.env.MERCHANT_UPI_NAME = "Browser Fixture";
process.env.ORDER_TRACKING_SECRET = "browser-fixture-secret-never-for-production";
process.env.TRUSTED_PROXY_IPS = "";

async function main() {
  const { db } = await import("../src/db");
  const openingHours = Object.fromEntries(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
      .map((day) => [day, { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" }]),
  );
  const image = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" fill="#e9eddf"/></svg>',
  );
  const products = ["AVAILABLE", "SOLD_OUT", "COMING_SOON"].map((status, index) => ({
    id: `browser-product-${index}`, name: `Fixture Fruit Bowl ${index}`,
    category_id: "00000000-0000-4000-8000-000000000001", category: "Fruit Bowls",
    image_url: image, availability_status: status, description: "Isolated browser fixture.",
    featured: index === 0, tags: [], has_regular_price: true,
    variants: [{ size: "Regular", price: 120 }, { size: "Large", price: 180 }],
  }));
  Object.defineProperty(db, "connect", {
    value: async () => { throw new Error("Browser harness forbids database connections and writes."); },
  });
  Object.defineProperty(db, "query", {
    value: async (sql: string) => {
      let rows: unknown[];
      if (sql.includes("FROM products p") && sql.includes("GROUP BY p.id")) rows = products;
      else if (sql.includes("FROM public.restaurant_settings")) {
        rows = [{ acceptingOrders: true, openingHours, updatedAt: "2026-11-08T00:00:00.000Z" }];
      } else if (sql.includes("FROM products p") && sql.includes("ANY($1::varchar[])")) {
        rows = products.flatMap((product) => product.variants.map((variant) => ({
          product_id: product.id, product_name: product.name,
          available: product.availability_status === "AVAILABLE", ...variant,
        })));
      } else if (sql.includes("FROM restaurant_tables")) rows = [];
      else if (sql === "SELECT 1") rows = [{ value: 1 }];
      else throw new Error("Unexpected query in browser harness; real database access is forbidden.");
      return { rows, rowCount: rows.length };
    },
  });
  const { app } = await import("../src/server");
  app.listen(5191, "127.0.0.1", () => console.log("Read-only browser contract harness: 5191"));
}

void main();
