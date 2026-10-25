import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { db } from "../db";

const router = Router();
const SESSION_COOKIE = "fr_admin_session";
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftHash = Buffer.from(hash(left), "hex");
  const rightHash = Buffer.from(hash(right), "hex");
  return timingSafeEqual(leftHash, rightHash);
}

function isDemoMode() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.DEMO_PAYMENTS_ENABLED === "true"
  );
}

function adminConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH);
}

function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, salt, digest] = encodedHash.split(":");
  if (
    algorithm !== "scrypt" ||
    !salt ||
    !digest ||
    !/^[A-Za-z0-9_-]{22,}$/.test(salt) ||
    !/^[A-Za-z0-9_-]{40,}$/.test(digest)
  ) {
    return false;
  }

  const expected = Buffer.from(digest, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function setSessionCookie(res: import("express").Response, token: string) {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/api/admin",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(SESSION_LIFETIME_MS / 1000)}`,
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

function clearSessionCookie(res: import("express").Response) {
  const attributes = [
    `${SESSION_COOKIE}=`,
    "Path=/api/admin",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

function getCookie(req: import("express").Request, name: string) {
  const cookieHeader = req.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

const requireAllowedOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  if (origin && !allowedOrigins.includes(origin)) {
    res.status(403).json({ message: "Request origin is not allowed." });
    return;
  }
  next();
};

const requireAdmin: RequestHandler = async (req, res, next) => {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{40,}$/.test(token)) {
    res.status(401).json({ message: "Admin authentication required." });
    return;
  }

  try {
    const result = await db.query(
      `SELECT admin_id
       FROM admin_sessions
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [hash(token)],
    );
    const adminId = result.rows[0]?.admin_id as string | undefined;
    if (!adminId) {
      clearSessionCookie(res);
      res.status(401).json({ message: "Admin session expired. Please sign in again." });
      return;
    }
    res.locals.adminId = adminId;
    next();
  } catch (error) {
    console.error("Admin session validation failed", {
      code: (error as { code?: string }).code,
    });
    res.status(503).json({ message: "Unable to validate the admin session." });
  }
};

function rateLimit(maxRequests: number, windowMs: number): RequestHandler {
  const attempts = new Map<string, { count: number; resetsAt: number }>();
  return (req, res, next) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.resetsAt <= now) {
      attempts.set(key, { count: 1, resetsAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > maxRequests) {
      res.status(429).json({ message: "Too many sign-in attempts. Try again later." });
      return;
    }
    next();
  };
}

router.use(requireAllowedOrigin);

router.post(
  "/auth/login",
  rateLimit(5, 60_000),
  async (req, res) => {
    if (!adminConfigured()) {
      res.status(503).json({ message: "Admin authentication is not configured." });
      return;
    }
    const parsed = z.object({
      username: z.string().min(1).max(120),
      password: z.string().min(6).max(10),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Enter your admin username and a password between 6 and 10 characters.",
      });
      return;
    }

    const configuredUsername = process.env.ADMIN_USERNAME!;
    const usernameMatches = safeEqual(parsed.data.username, configuredUsername);
    const passwordMatches = verifyPassword(
      parsed.data.password,
      process.env.ADMIN_PASSWORD_HASH!,
    );
    if (!usernameMatches || !passwordMatches) {
      res.status(401).json({ message: "Invalid admin credentials." });
      return;
    }

    try {
      await db.query("DELETE FROM admin_sessions WHERE expires_at <= NOW()");
      const token = randomBytes(32).toString("base64url");
      const adminId = configuredUsername;
      await db.query(
        `INSERT INTO admin_sessions (token_hash, admin_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '8 hours')`,
        [hash(token), adminId],
      );
      setSessionCookie(res, token);
      res.json({ adminId });
    } catch (error) {
      console.error("Admin session creation failed", {
        code: (error as { code?: string }).code,
      });
      res.status(503).json({ message: "Unable to start an admin session." });
    }
  },
);

router.get("/auth/session", requireAdmin, (_req, res) => {
  res.json({ adminId: res.locals.adminId as string });
});

router.post("/auth/logout", requireAdmin, async (req, res) => {
  const token = getCookie(req, SESSION_COOKIE);
  try {
    if (token) {
      await db.query("DELETE FROM admin_sessions WHERE token_hash = $1", [
        hash(token),
      ]);
    }
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) {
    console.error("Admin logout failed", {
      code: (error as { code?: string }).code,
    });
    res.status(503).json({ message: "Unable to end the admin session." });
  }
});

router.use(requireAdmin);

router.get("/dashboard", async (_req, res) => {
  try {
    const [summary, recentOrders] = await Promise.all([
      db.query(
        `WITH local_day AS (
           SELECT ((NOW() AT TIME ZONE 'Asia/Kolkata')::date::timestamp
                   AT TIME ZONE 'Asia/Kolkata') AS start_at
         )
         SELECT
           COUNT(*) FILTER (WHERE o.created_at >= local_day.start_at)::int AS total_orders_today,
           COUNT(*) FILTER (WHERE o.order_status = 'PLACED' AND o.created_at >= local_day.start_at)::int AS new_orders,
           COUNT(*) FILTER (WHERE o.order_status = 'PREPARING' AND o.created_at >= local_day.start_at)::int AS preparing_orders,
           COUNT(*) FILTER (WHERE o.order_status = 'READY' AND o.created_at >= local_day.start_at)::int AS ready_orders,
           COUNT(*) FILTER (WHERE o.order_status = 'COMPLETED' AND o.created_at >= local_day.start_at)::int AS completed_orders,
           COALESCE(SUM(o.total_amount) FILTER (
             WHERE o.payment_status = 'PAID'
               AND p.payment_source = 'MANUAL_UPI'
               AND p.verified_at IS NOT NULL
               AND o.created_at >= local_day.start_at
           ), 0)::bigint AS verified_revenue_today,
           COALESCE(SUM(o.total_amount) FILTER (
             WHERE o.payment_status = 'PAID'
               AND p.payment_source = 'DEMO'
               AND o.created_at >= local_day.start_at
           ), 0)::bigint AS demo_revenue_today
         FROM orders o
         CROSS JOIN local_day
         LEFT JOIN payments p ON p.order_id = o.id`,
      ),
      db.query(
        `SELECT o.id, o.order_number, o.customer_name, o.total_amount,
                o.payment_status, o.order_status, o.created_at,
                p.payment_source
         FROM orders o
         JOIN payments p ON p.order_id = o.id
         ORDER BY o.created_at DESC NULLS LAST
         LIMIT 10`,
      ),
    ]);
    res.json({
      summary: summary.rows[0],
      recentOrders: recentOrders.rows,
      demoPaymentsEnabled: isDemoMode(),
    });
  } catch (error) {
    console.error("Admin dashboard query failed", {
      code: (error as { code?: string }).code,
    });
    res.status(500).json({ message: "Unable to load dashboard data." });
  }
});

router.get("/orders", async (req, res) => {
  const parsed = z.object({
    status: z.enum(["ALL", "PLACED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]).default("ALL"),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
  }).safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid order filter or page." });
    return;
  }

  try {
    const [orders, count] = await Promise.all([
      db.query(
        `SELECT o.id, o.order_number, o.customer_name, o.customer_phone,
                o.fulfillment_type, o.total_amount, o.payment_status,
                o.order_status, o.created_at, p.payment_source
         FROM orders o
         LEFT JOIN payments p ON p.order_id = o.id
         WHERE ($1 = 'ALL' OR o.order_status = $1)
         ORDER BY o.created_at DESC NULLS LAST
         LIMIT $2 OFFSET $3`,
        [parsed.data.status, parsed.data.limit, parsed.data.offset],
      ),
      db.query(
        `SELECT COUNT(*)::int AS total
         FROM orders
         WHERE ($1 = 'ALL' OR order_status = $1)`,
        [parsed.data.status],
      ),
    ]);
    res.json({
      items: orders.rows,
      total: count.rows[0].total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
  } catch (error) {
    console.error("Admin order list query failed", {
      code: (error as { code?: string }).code,
    });
    res.status(500).json({ message: "Unable to load orders." });
  }
});

router.get("/orders/:orderId", async (req, res) => {
  const orderId = z.string().uuid().safeParse(req.params.orderId);
  if (!orderId.success) {
    res.status(404).json({ message: "Order not found." });
    return;
  }
  try {
    const result = await db.query(
      `SELECT o.id, o.order_number, o.customer_name, o.customer_phone,
              o.fulfillment_type, o.total_amount, o.payment_status,
              o.order_status, o.created_at,
              p.payment_status AS recorded_payment_status,
              p.payment_source, p.transaction_reference,
              p.verified_transaction_reference, p.verified_by, p.verified_at,
              COALESCE(
                json_agg(json_build_object(
                  'productId', oi.product_id,
                  'productName', oi.product_name,
                  'size', oi.size,
                  'quantity', oi.quantity,
                  'unitPrice', oi.unit_price
                ) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL),
                '[]'::json
              ) AS items
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.id, p.id`,
      [orderId.data],
    );
    if (!result.rows[0]) {
      res.status(404).json({ message: "Order not found." });
      return;
    }
    res.json({ ...result.rows[0], demoPaymentsEnabled: isDemoMode() });
  } catch (error) {
    console.error("Admin order details query failed", {
      code: (error as { code?: string }).code,
    });
    res.status(500).json({ message: "Unable to load order details." });
  }
});

router.patch("/orders/:orderId/status", async (req, res) => {
  const orderId = z.string().uuid().safeParse(req.params.orderId);
  const parsedBody = z.object({
    status: z.enum(["PREPARING", "READY", "COMPLETED"]),
  }).safeParse(req.body);
  if (!orderId.success || !parsedBody.success) {
    res.status(400).json({ message: "Invalid order or requested status." });
    return;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT o.order_status, o.payment_status, p.payment_source
       FROM orders o
       JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1
       FOR UPDATE OF o, p`,
      [orderId.data],
    );
    const order = result.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      res.status(404).json({ message: "Order not found." });
      return;
    }
    const allowedNext: Record<string, string> = {
      PLACED: "PREPARING",
      PREPARING: "READY",
      READY: "COMPLETED",
    };
    if (allowedNext[order.order_status] !== parsedBody.data.status) {
      await client.query("ROLLBACK");
      res.status(409).json({ message: "That order status transition is not allowed." });
      return;
    }
    if (parsedBody.data.status === "PREPARING") {
      const paidByAllowedSource =
        order.payment_status === "PAID" &&
        (order.payment_source === "MANUAL_UPI" ||
          (order.payment_source === "DEMO" && isDemoMode()));
      if (!paidByAllowedSource) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message: "Payment must be verified before preparation can begin.",
        });
        return;
      }
    }
    await client.query(
      `UPDATE orders SET order_status = $2 WHERE id = $1`,
      [orderId.data, parsedBody.data.status],
    );
    await client.query("COMMIT");
    res.json({ orderId: orderId.data, orderStatus: parsedBody.data.status });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Admin order status update failed", {
      code: (error as { code?: string }).code,
    });
    res.status(500).json({ message: "Unable to update order status." });
  } finally {
    client.release();
  }
});

router.post("/orders/:orderId/payment-verification", async (req, res) => {
  const orderId = z.string().uuid().safeParse(req.params.orderId);
  const parsedBody = z.object({
    decision: z.enum(["PAID", "REJECTED"]),
    verifiedTransactionReference: z.string().trim().min(4).max(120).optional(),
  }).safeParse(req.body);
  if (
    !orderId.success ||
    !parsedBody.success ||
    (parsedBody.data.decision === "PAID" &&
      !parsedBody.data.verifiedTransactionReference)
  ) {
    res.status(400).json({
      message: "Choose a payment decision and provide the confirmed transaction reference when marking paid.",
    });
    return;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT o.payment_status, p.payment_status AS recorded_payment_status,
              p.payment_source
       FROM orders o
       JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1
       FOR UPDATE OF o, p`,
      [orderId.data],
    );
    const payment = result.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      res.status(404).json({ message: "Order payment not found." });
      return;
    }
    if (
      payment.payment_source !== "MANUAL_UPI" ||
      payment.recorded_payment_status !== "PENDING_VERIFICATION"
    ) {
      await client.query("ROLLBACK");
      res.status(409).json({
        message: "Only pending manual UPI claims can be verified here.",
      });
      return;
    }

    const reference =
      parsedBody.data.decision === "PAID"
        ? parsedBody.data.verifiedTransactionReference
        : null;
    await client.query(
      `UPDATE payments
       SET payment_status = $2,
           verified_by = $3,
           verified_at = NOW(),
           verified_transaction_reference = $4
       WHERE order_id = $1`,
      [
        orderId.data,
        parsedBody.data.decision,
        res.locals.adminId as string,
        reference,
      ],
    );
    await client.query(
      `UPDATE orders SET payment_status = $2 WHERE id = $1`,
      [orderId.data, parsedBody.data.decision],
    );
    await client.query("COMMIT");
    res.json({
      orderId: orderId.data,
      paymentStatus: parsedBody.data.decision,
      verifiedBy: res.locals.adminId as string,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    const databaseCode = (error as { code?: string }).code;
    if (databaseCode === "23505") {
      res.status(409).json({
        message: "That verified transaction reference is already assigned to another order.",
      });
      return;
    }
    console.error("Admin payment verification failed", { code: databaseCode });
    res.status(500).json({ message: "Unable to update payment verification." });
  } finally {
    client.release();
  }
});

const menuStatusSchema = z.enum(["AVAILABLE", "SOLD_OUT", "COMING_SOON"]);
const menuProductSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  category: z.string().trim().min(1).max(80),
  image: z.string().url().max(2048)
    .refine((value) => /^https?:\/\//i.test(value), "Image URL must use HTTP or HTTPS.")
    .nullable(),
  availabilityStatus: menuStatusSchema,
  featured: z.boolean(),
  regularPrice: z.number().int().positive().max(1_000_000),
  largePrice: z.number().int().positive().max(1_000_000).nullable(),
}).strict();

const productIdSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9_&-]+$/);

async function getAdminMenuProduct(productId: string) {
  const result = await db.query(
    `SELECT p.id, p.name, p.description, p.category, p.image_url,
            p.availability_status, p.featured, p.archived_at,
            COALESCE(
              json_agg(json_build_object('size', v.size, 'price', v.price)
                       ORDER BY CASE v.size WHEN 'Regular' THEN 1 WHEN 'Large' THEN 2 ELSE 3 END)
                FILTER (WHERE v.id IS NOT NULL),
              '[]'::json
            ) AS variants
     FROM products p
     LEFT JOIN product_variants v ON v.product_id = p.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [productId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    category: row.category as string,
    image: (row.image_url as string | null) ?? null,
    availabilityStatus: row.availability_status as z.infer<typeof menuStatusSchema>,
    featured: row.featured === true,
    archived: row.archived_at !== null,
    variants: row.variants as Array<{ size: "Regular" | "Large"; price: number }>,
  };
}

function menuProductResponse(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    category: row.category,
    image: row.image_url ?? null,
    availabilityStatus: row.availability_status,
    featured: row.featured === true,
    archived: row.archived_at !== null,
    variants: row.variants,
  };
}

router.get("/menu", async (req, res) => {
  const includeArchived = req.query.includeArchived === "true";
  try {
    const result = await db.query(
      `SELECT p.id, p.name, p.description, p.category, p.image_url,
              p.availability_status, p.featured, p.archived_at,
              COALESCE(
                json_agg(json_build_object('size', v.size, 'price', v.price)
                         ORDER BY CASE v.size WHEN 'Regular' THEN 1 WHEN 'Large' THEN 2 ELSE 3 END)
                  FILTER (WHERE v.id IS NOT NULL),
                '[]'::json
              ) AS variants
       FROM products p
       LEFT JOIN product_variants v ON v.product_id = p.id
       WHERE $1::boolean OR p.archived_at IS NULL
       GROUP BY p.id
       ORDER BY p.archived_at NULLS FIRST, p.category, p.name`,
      [includeArchived],
    );
    res.json(result.rows.map((row) => menuProductResponse(row)));
  } catch (error) {
    console.error("Admin menu listing failed", {
      code: (error as { code?: string }).code,
    });
    res.status(500).json({ message: "Unable to load menu items." });
  }
});

router.post("/menu", async (req, res) => {
  const parsed = menuProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Check the product details and prices, then try again." });
    return;
  }

  const product = parsed.data;
  const baseSlug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "item";
  const productId = `${baseSlug}-${randomBytes(4).toString("hex")}`;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO products
         (id, name, description, category, image_url, available, availability_status, featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        productId,
        product.name,
        product.description || null,
        product.category,
        product.image,
        product.availabilityStatus === "AVAILABLE",
        product.availabilityStatus,
        product.featured,
      ],
    );
    await client.query(
      `INSERT INTO product_variants (product_id, size, price) VALUES ($1, 'Regular', $2)`,
      [productId, product.regularPrice],
    );
    if (product.largePrice !== null) {
      await client.query(
        `INSERT INTO product_variants (product_id, size, price) VALUES ($1, 'Large', $2)`,
        [productId, product.largePrice],
      );
    }
    await client.query("COMMIT");
    const created = await getAdminMenuProduct(productId);
    res.status(201).json(created);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Admin menu product creation failed", {
      code: (error as { code?: string }).code,
    });
    res.status(500).json({ message: "Unable to add this menu item." });
  } finally {
    client.release();
  }
});

router.patch("/menu/:productId", async (req, res) => {
  const productId = productIdSchema.safeParse(req.params.productId);
  const parsed = menuProductSchema.safeParse(req.body);
  if (!productId.success || !parsed.success) {
    res.status(400).json({ message: "Check the product details and prices, then try again." });
    return;
  }
  const product = parsed.data;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT id FROM products WHERE id = $1 FOR UPDATE",
      [productId.data],
    );
    if (!existing.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ message: "Menu item not found." });
      return;
    }
    await client.query(
      `UPDATE products
       SET name = $2, description = $3, category = $4, image_url = $5,
           availability_status = $6, available = $7, featured = $8
       WHERE id = $1`,
      [
        productId.data,
        product.name,
        product.description || null,
        product.category,
        product.image,
        product.availabilityStatus,
        product.availabilityStatus === "AVAILABLE",
        product.featured,
      ],
    );
    await client.query(
      `INSERT INTO product_variants (product_id, size, price)
       VALUES ($1, 'Regular', $2)
       ON CONFLICT (product_id, size) DO UPDATE SET price = EXCLUDED.price`,
      [productId.data, product.regularPrice],
    );
    if (product.largePrice === null) {
      await client.query(
        "DELETE FROM product_variants WHERE product_id = $1 AND size = 'Large'",
        [productId.data],
      );
    } else {
      await client.query(
        `INSERT INTO product_variants (product_id, size, price)
         VALUES ($1, 'Large', $2)
         ON CONFLICT (product_id, size) DO UPDATE SET price = EXCLUDED.price`,
        [productId.data, product.largePrice],
      );
    }
    await client.query("COMMIT");
    res.json(await getAdminMenuProduct(productId.data));
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Admin menu product update failed", {
      code: (error as { code?: string }).code,
    });
    res.status(500).json({ message: "Unable to save this menu item." });
  } finally {
    client.release();
  }
});

router.patch("/menu/:productId/status", async (req, res) => {
  const productId = productIdSchema.safeParse(req.params.productId);
  const parsed = z.object({ availabilityStatus: menuStatusSchema }).strict().safeParse(req.body);
  if (!productId.success || !parsed.success) {
    res.status(400).json({ message: "Choose a valid availability status." });
    return;
  }
  try {
    if (parsed.data.availabilityStatus === "AVAILABLE") {
      const regularVariant = await db.query(
        `SELECT 1
         FROM product_variants
         WHERE product_id = $1 AND size = 'Regular' AND price > 0`,
        [productId.data],
      );
      if (!regularVariant.rowCount) {
        const product = await db.query(
          "SELECT 1 FROM products WHERE id = $1",
          [productId.data],
        );
        if (!product.rowCount) {
          res.status(404).json({ message: "Menu item not found." });
          return;
        }
        res.status(409).json({
          message: "Add a valid Regular price in Edit before marking this product available.",
        });
        return;
      }
    }
    const result = await db.query(
      `UPDATE products
       SET availability_status = $2, available = $3
       WHERE id = $1
       RETURNING id`,
      [
        productId.data,
        parsed.data.availabilityStatus,
        parsed.data.availabilityStatus === "AVAILABLE",
      ],
    );
    if (!result.rowCount) {
      res.status(404).json({ message: "Menu item not found." });
      return;
    }
    res.json(await getAdminMenuProduct(productId.data));
  } catch (error) {
    const databaseError = error as {
      code?: string;
      message?: string;
      detail?: string;
      constraint?: string;
    };
    console.error("Admin menu availability update failed", {
      endpoint: "PATCH /api/admin/menu/:productId/status",
      code: databaseError.code,
      message: databaseError.message,
      ...(process.env.NODE_ENV === "development"
        ? {
            detail: databaseError.detail,
            constraint: databaseError.constraint,
          }
        : {}),
    });
    res.status(500).json({
      message:
        process.env.NODE_ENV === "development"
          ? `Unable to update availability (database error ${databaseError.code ?? "unknown"}).`
          : "Unable to update availability.",
      ...(process.env.NODE_ENV === "development"
        ? { code: databaseError.code }
        : {}),
    });
  }
});

router.patch("/menu/:productId/archive", async (req, res) => {
  const productId = productIdSchema.safeParse(req.params.productId);
  const parsed = z.object({ archived: z.boolean() }).strict().safeParse(req.body);
  if (!productId.success || !parsed.success) {
    res.status(400).json({ message: "Choose whether to archive or restore this item." });
    return;
  }
  try {
    const result = await db.query(
      `UPDATE products SET archived_at = CASE WHEN $2 THEN COALESCE(archived_at, NOW()) ELSE NULL END
       WHERE id = $1 RETURNING id`,
      [productId.data, parsed.data.archived],
    );
    if (!result.rowCount) {
      res.status(404).json({ message: "Menu item not found." });
      return;
    }
    res.json(await getAdminMenuProduct(productId.data));
  } catch (error) {
    console.error("Admin menu archive update failed", {
      code: (error as { code?: string }).code,
    });
    res.status(500).json({ message: "Unable to update this menu item." });
  }
});

router.post("/menu/:productId/image", async (req, res) => {
  const productId = productIdSchema.safeParse(req.params.productId);
  if (!productId.success) {
    res.status(400).json({ message: "Invalid menu item." });
    return;
  }
  const parsed = z.object({ dataUrl: z.string().max(5_600_000) }).strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose an image no larger than 4 MB." });
    return;
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(parsed.data.dataUrl);
  if (!match) {
    res.status(400).json({ message: "Use a JPEG, PNG, or WebP image." });
    return;
  }
  const image = Buffer.from(match[2], "base64");
  if (image.length === 0 || image.length > 4 * 1024 * 1024) {
    res.status(400).json({ message: "Choose an image no larger than 4 MB." });
    return;
  }
  const hasValidSignature = match[1] === "image/jpeg"
    ? image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
    : match[1] === "image/png"
      ? image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : image.toString("ascii", 0, 4) === "RIFF" &&
        image.toString("ascii", 8, 12) === "WEBP";
  if (!hasValidSignature) {
    res.status(400).json({ message: "The selected file is not a valid image of that type." });
    return;
  }
  const storageUrl = process.env.SUPABASE_URL;
  const storageKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.MENU_STORAGE_BUCKET;
  const missingSettings = [
    !storageUrl ? "SUPABASE_URL" : null,
    !storageKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    !bucket ? "MENU_STORAGE_BUCKET" : null,
  ].filter((setting): setting is string => setting !== null);
  if (!storageUrl || !storageKey || !bucket) {
    res.status(503).json({
      message: `Image uploads need backend configuration: ${missingSettings.join(", ")}. Configure these in backend/.env and restart the backend.`,
    });
    return;
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(storageUrl);
  } catch {
    res.status(503).json({ message: "Image storage is not configured correctly." });
    return;
  }
  if (baseUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    res.status(503).json({ message: "Image storage is not configured securely." });
    return;
  }
  try {
    const existing = await db.query("SELECT id FROM products WHERE id = $1", [
      productId.data,
    ]);
    if (!existing.rowCount) {
      res.status(404).json({ message: "Menu item not found." });
      return;
    }
  } catch (error) {
    console.error("Admin menu image product lookup failed", {
      code: (error as { code?: string }).code,
    });
    res.status(503).json({ message: "Unable to prepare the image upload." });
    return;
  }
  const extension = match[1] === "image/jpeg" ? "jpg" : match[1].slice("image/".length);
  const objectPath = `menu/${randomUUID()}.${extension}`;
  try {
    const upload = await fetch(
      `${baseUrl.origin}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${storageKey}`,
          apikey: storageKey,
          "Content-Type": match[1],
          "x-upsert": "false",
        },
        body: image,
      },
    );
    if (!upload.ok) {
      console.error("Supabase menu image upload failed", { status: upload.status });
      res.status(502).json({ message: "Image upload failed. Please try again." });
      return;
    }
    await db.query("UPDATE products SET image_url = $2 WHERE id = $1", [
      productId.data,
      `${baseUrl.origin}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`,
    ]);
    res.status(201).json({
      imageUrl: `${baseUrl.origin}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`,
    });
  } catch (error) {
    console.error("Supabase menu image upload failed", {
      message: error instanceof Error ? error.message : "Unknown upload error",
    });
    res.status(502).json({ message: "Image upload failed. Please try again." });
  }
});

export default router;
