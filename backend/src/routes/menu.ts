
import { Router } from "express";
import { db } from "../db";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT
        p.id,
        p.name,
        p.category,
        p.image_url,
        p.availability_status,
        p.description,
        p.featured,
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
      LEFT JOIN product_variants v
        ON p.id = v.product_id
      WHERE p.archived_at IS NULL
      GROUP BY p.id
      ORDER BY p.category, p.name
    `);

    const menu = result.rows.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      image: item.image_url,
      available: item.availability_status === "AVAILABLE",
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
