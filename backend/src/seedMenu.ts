
import "dotenv/config";
import { db } from "./db";
import { menuItems } from "../../frontend/src/data/menu";

async function seedMenu() {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    for (const item of menuItems) {
      await client.query(
        `INSERT INTO products
         (id, name, category, image_url, available, featured)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id)
         DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           image_url = EXCLUDED.image_url,
           available = EXCLUDED.available,
           featured = EXCLUDED.featured`,
        [
          item.id,
          item.name,
          item.category,
          item.image ?? null,
          item.available,
          item.featured ?? false,
        ]
      );

      for (const variant of item.variants) {
        await client.query(
          `INSERT INTO product_variants
           (product_id, size, price)
           VALUES ($1, $2, $3)
           ON CONFLICT (product_id, size)
           DO UPDATE SET price = EXCLUDED.price`,
          [item.id, variant.size, variant.price]
        );
      }
    }

    await client.query("COMMIT");

    console.log(
      `Successfully imported ${menuItems.length} menu items`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Menu import failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.end();
  }
}

seedMenu();
