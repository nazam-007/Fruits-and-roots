
import { Router } from "express";
import { db } from "../db";
import { subscribeToCatalogChanges } from "../catalogEvents";

const router = Router();

router.get("/events", (_req, res) => {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 1000\n\n");

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    unsubscribe();
  };
  const sendChange = () => {
    if (closed) return;
    try {
      res.write("event: catalog-changed\ndata: {}\n\n");
    } catch {
      cleanup();
    }
  };
  const unsubscribe = subscribeToCatalogChanges(sendChange);
  const keepAlive = setInterval(() => {
    if (closed) return;
    try {
      res.write(": keepalive\n\n");
    } catch {
      cleanup();
    }
  }, 20_000);

  res.on("close", cleanup);
  res.on("error", cleanup);
});

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT
        p.id,
        p.name,
        p.category_id AS category_id,
        c.name AS category,
        p.image_url,
        p.availability_status,
        p.description,
        p.featured,
        EXISTS (
          SELECT 1
          FROM product_variants regular_variant
          WHERE regular_variant.product_id = p.id
            AND regular_variant.size = 'Regular'
            AND regular_variant.price > 0
        ) AS has_regular_price,
        COALESCE(
          json_agg(
            json_build_object(
              'size', v.size,
              'price', v.price
            )
            ORDER BY
              CASE v.size
                WHEN 'Regular' THEN 1
                WHEN 'Large' THEN 2
                ELSE 3
              END
          ) FILTER (WHERE v.id IS NOT NULL),
          '[]'::json
        ) AS variants
      FROM products p
      JOIN categories c
        ON c.id = p.category_id
      LEFT JOIN product_variants v
        ON p.id = v.product_id
      WHERE p.archived_at IS NULL
      GROUP BY p.id, c.name, c.sort_order
      ORDER BY c.sort_order, c.name, p.name
    `);

    const menu = result.rows.map((item) => ({
      id: item.id,
      categoryId: item.category_id,
      name: item.name,
      category: item.category,
      image: item.image_url,
      available:
        item.availability_status === "AVAILABLE" &&
        item.has_regular_price === true,
      availabilityStatus: item.availability_status,
      description: item.description,
      featured: item.featured,
      variants: item.variants,
    }));

    res.json(menu);
  } catch (error) {
    console.error("Failed to fetch menu:", error);

    res.status(500).json({
      message: "Unable to fetch menu",
    });
  }
});

export default router;
