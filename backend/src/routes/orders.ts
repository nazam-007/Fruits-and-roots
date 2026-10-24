import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "../db";

const router = Router();

const orderItemSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  size: z.enum(["Regular", "Large"]),
  quantity: z.number().int().min(1).max(99),
});

const quoteSchema = z.object({
  fulfillmentType: z.enum(["PICKUP", "TABLE"]).default("PICKUP"),
  tableNumber: z.string().trim().min(1).max(20).optional(),
  items: z.array(orderItemSchema).min(1).max(50),
});

const createOrderSchema = quoteSchema.extend({
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z
    .string()
    .trim()
    .max(20)
    .refine((phone) => {
      const normalized = phone.replace(/[()\s-]/g, "");
      return /^\+?\d{7,15}$/.test(normalized);
    })
    .optional(),
  idempotencyKey: z.string().uuid(),
});

type OrderRequest = z.infer<typeof createOrderSchema>;
type PricedItem = {
  productId: string;
  productName: string;
  size: "Regular" | "Large";
  quantity: number;
  unitPrice: number;
};

function rateLimit(maxRequests: number, windowMs: number): RequestHandler {
  const clients = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    let client = clients.get(key);

    if (!client || client.resetAt <= now) {
      client = { count: 0, resetAt: now + windowMs };
      clients.set(key, client);
    }

    client.count += 1;
    if (client.count > maxRequests) {
      res.setHeader(
        "Retry-After",
        Math.max(1, Math.ceil((client.resetAt - now) / 1000)),
      );
      res.status(429).json({ message: "Too many requests. Please try again shortly." });
      return;
    }

    if (clients.size > 10_000) {
      for (const [clientKey, entry] of clients) {
        if (entry.resetAt <= now) clients.delete(clientKey);
      }
    }
    next();
  };
}

const limitQuotes = rateLimit(30, 60_000);
const limitOrders = rateLimit(5, 60_000);
const limitTracking = rateLimit(60, 60_000);
const limitDemoPayments = rateLimit(5, 60_000);

function hasDuplicateItems(items: OrderRequest["items"] | z.infer<typeof quoteSchema>["items"]) {
  const seen = new Set<string>();
  return items.some((item) => {
    const key = `${item.productId}\u0000${item.size}`;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

function getMerchantConfig() {
  const upiId = process.env.MERCHANT_UPI_ID?.trim();
  const merchantName = process.env.MERCHANT_UPI_NAME?.trim();
  return upiId && merchantName ? { upiId, merchantName } : null;
}

function demoPaymentsEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.DEMO_PAYMENTS_ENABLED === "true"
  );
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function makeTrackingToken(idempotencyKey: string) {
  const secret = process.env.ORDER_TRACKING_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return null;
  return createHmac("sha256", secret)
    .update(`order-tracking:${idempotencyKey}`)
    .digest("base64url");
}

function hashesMatch(left: string | null, right: string) {
  if (!left || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function getBearerToken(req: import("express").Request) {
  return req.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
}

function logOrderCreationError(error: unknown) {
  if (error instanceof Error) {
    const databaseError = error as Error & {
      code?: string;
      column?: string;
      constraint?: string;
      table?: string;
    };
    console.error("Order creation failed", {
      code: databaseError.code,
      message: databaseError.message,
      table: databaseError.table,
      column: databaseError.column,
      constraint: databaseError.constraint,
    });
    return;
  }

  console.error("Order creation failed with a non-Error value.");
}

async function createPaymentDetails(totalAmount: number) {
  const merchant = getMerchantConfig();
  if (!merchant) return null;

  const paymentUri = `upi://pay?${new URLSearchParams({
    pa: merchant.upiId,
    pn: merchant.merchantName,
    am: totalAmount.toFixed(2),
    cu: "INR",
  }).toString()}`;
  const qrCodeDataUrl = await QRCode.toDataURL(paymentUri, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 280,
    color: { dark: "#253b2a", light: "#ffffff" },
  });

  return {
    merchantName: merchant.merchantName,
    upiId: merchant.upiId,
    currency: "INR" as const,
    paymentUri,
    qrCodeDataUrl,
  };
}

async function priceItems(
  items: z.infer<typeof quoteSchema>["items"],
): Promise<PricedItem[] | null> {
  const productIds = [...new Set(items.map((item) => item.productId))];
  const result = await db.query(
    `SELECT p.id AS product_id, p.name AS product_name,
            (p.availability_status = 'AVAILABLE' AND p.archived_at IS NULL) AS available,
            v.size, v.price
     FROM products p
     JOIN product_variants v ON v.product_id = p.id
     WHERE p.id = ANY($1::varchar[]) AND p.archived_at IS NULL`,
    [productIds],
  );
  const priceMap = new Map<string, { name: string; price: number; available: boolean }>();

  for (const row of result.rows) {
    priceMap.set(`${row.product_id}\u0000${row.size}`, {
      name: row.product_name,
      price: Number(row.price),
      available: row.available === true,
    });
  }

  const priced: PricedItem[] = [];
  for (const item of items) {
    const current = priceMap.get(`${item.productId}\u0000${item.size}`);
    if (!current?.available || !Number.isSafeInteger(current.price)) return null;
    priced.push({
      productId: item.productId,
      productName: current.name,
      size: item.size,
      quantity: item.quantity,
      unitPrice: current.price,
    });
  }

  return priced;
}

function calculateTotal(items: PricedItem[]) {
  const total = items.reduce(
    (amount, item) => amount + item.unitPrice * item.quantity,
    0,
  );
  if (!Number.isSafeInteger(total) || total <= 0 || total > 2_147_483_647) {
    throw new Error("Order total is outside the supported range");
  }
  return total;
}

async function isActiveTable(tableNumber: string) {
  const result = await db.query(
    `SELECT id FROM restaurant_tables
     WHERE table_number = $1 AND is_active IS TRUE`,
    [tableNumber],
  );
  return result.rows[0] ?? null;
}

function toOrderResponse(row: {
  id: string;
  order_number: string;
  customer_name: string;
  fulfillment_type: "PICKUP" | "TABLE";
  table_number: string | null;
  total_amount: number;
  payment_status: string;
  payment_source: string | null;
  order_status: string;
  created_at: Date;
  items?: Array<{
    productId: string;
    productName: string;
    size: string;
    quantity: number;
    unitPrice: number;
  }>;
}, trackingToken?: string) {
  return {
    orderId: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    fulfillmentType: row.fulfillment_type,
    tableNumber: row.table_number,
    totalAmount: Number(row.total_amount),
    paymentStatus: row.payment_status,
    paymentSource: row.payment_source,
    orderStatus: row.order_status,
    createdAt: row.created_at,
    ...(row.items ? { items: row.items } : {}),
    ...(trackingToken ? { trackingToken } : {}),
  };
}

async function loadOrder(orderId: string) {
  const result = await db.query(
    `    SELECT o.id, o.order_number, o.customer_name, o.fulfillment_type, rt.table_number, o.total_amount,
            o.payment_status,
            (SELECT p.payment_source FROM payments p WHERE p.order_id = o.id LIMIT 1) AS payment_source,
            o.order_status, o.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'productId', oi.product_id,
                  'productName', oi.product_name,
                  'size', oi.size,
                  'quantity', oi.quantity,
                  'unitPrice', oi.unit_price
                ) ORDER BY oi.id
              ) FILTER (WHERE oi.id IS NOT NULL),
              '[]'::json
            ) AS items
     FROM orders o
     LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = $1
     GROUP BY o.id, rt.table_number`,
    [orderId],
  );
  return result.rows[0] ?? null;
}

async function loadOrderInTransaction(client: import("pg").PoolClient, key: string) {
  const result = await client.query(
    `    SELECT o.id, o.order_number, o.customer_name, o.fulfillment_type, rt.table_number, o.total_amount,
            o.payment_status,
            (SELECT p.payment_source FROM payments p WHERE p.order_id = o.id LIMIT 1) AS payment_source,
            o.order_status, o.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'productId', oi.product_id,
                  'productName', oi.product_name,
                  'size', oi.size,
                  'quantity', oi.quantity,
                  'unitPrice', oi.unit_price
                ) ORDER BY oi.id
              ) FILTER (WHERE oi.id IS NOT NULL),
              '[]'::json
            ) AS items
     FROM orders o
     LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = (
       SELECT id FROM orders WHERE idempotency_key = $1
     )
     GROUP BY o.id, rt.table_number`,
    [key],
  );
  return result.rows[0] ?? null;
}

router.get("/payment-config", (_req, res) => {
  const config = getMerchantConfig();
  if (!config) {
    res.json({
      configured: false,
      demoPaymentsEnabled: demoPaymentsEnabled(),
    });
    return;
  }

  res.json({
    configured: true,
    upiId: config.upiId,
    merchantName: config.merchantName,
    currency: "INR",
    demoPaymentsEnabled: demoPaymentsEnabled(),
  });
});

router.get("/tables", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT table_number
       FROM restaurant_tables
       WHERE is_active IS TRUE
       ORDER BY table_number`,
    );
    res.json(result.rows.map((row) => row.table_number));
  } catch {
    res.status(500).json({ message: "Unable to load restaurant tables." });
  }
});

router.post("/orders/quote", limitQuotes, async (req, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Check the fulfillment type and order items." });
    return;
  }
  if (
    parsed.data.fulfillmentType === "TABLE" &&
    !parsed.data.tableNumber
  ) {
    res.status(400).json({ message: "A table number is required for table orders." });
    return;
  }
  if (hasDuplicateItems(parsed.data.items)) {
    res.status(400).json({ message: "Each product size may only appear once." });
    return;
  }

  try {
    const [table, items] = await Promise.all([
      parsed.data.fulfillmentType === "TABLE"
        ? isActiveTable(parsed.data.tableNumber!)
        : Promise.resolve(true),
      priceItems(parsed.data.items),
    ]);
    if (!table) {
      res.status(400).json({ message: "Select an active restaurant table." });
      return;
    }
    if (!items) {
      res.status(400).json({ message: "One or more products are unavailable." });
      return;
    }

    const totalAmount = calculateTotal(items);
    const merchant = getMerchantConfig();
    if (!merchant) {
      res.json({ configured: false, totalAmount, items });
      return;
    }

    const paymentUri = `upi://pay?${new URLSearchParams({
      pa: merchant.upiId,
      pn: merchant.merchantName,
      am: totalAmount.toFixed(2),
      cu: "INR",
    }).toString()}`;
    const qrCodeDataUrl = await QRCode.toDataURL(paymentUri, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
      color: { dark: "#253b2a", light: "#ffffff" },
    });

    res.json({
      configured: true,
      merchantName: merchant.merchantName,
      upiId: merchant.upiId,
      currency: "INR",
      totalAmount,
      items,
      paymentUri,
      qrCodeDataUrl,
    });
  } catch {
    res.status(500).json({ message: "Unable to prepare payment instructions." });
  }
});

router.post("/orders", limitOrders, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: "Check your customer details and order items.",
    });
    return;
  }
  const input = parsed.data;
  if (hasDuplicateItems(input.items)) {
    res.status(400).json({ message: "Each product size may only appear once." });
    return;
  }
  if (!getMerchantConfig()) {
    res.status(503).json({ message: "UPI payment is not configured." });
    return;
  }
  const trackingToken = makeTrackingToken(input.idempotencyKey);
  if (!trackingToken) {
    res.status(503).json({ message: "Secure order tracking is not configured." });
    return;
  }

  const requestHash = hash(
    JSON.stringify({
      customerName: input.customerName,
      customerPhone: input.customerPhone ?? null,
      fulfillmentType: input.fulfillmentType,
      tableNumber: input.tableNumber ?? null,
      items: input.items,
    }),
  );
  const trackingTokenHash = hash(trackingToken);

  let client;
  try {
    client = await db.connect();
    await client.query("BEGIN");

    const priorResult = await client.query(
      `SELECT request_hash, tracking_token_hash
       FROM orders WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    if (priorResult.rows[0]) {
      const prior = priorResult.rows[0];
      if (
        !hashesMatch(prior.request_hash, requestHash) ||
        !hashesMatch(prior.tracking_token_hash, trackingTokenHash)
      ) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message: "This checkout key was already used for a different order.",
        });
        return;
      }
      const existingOrder = await loadOrderInTransaction(
        client,
        input.idempotencyKey,
      );
      await client.query("COMMIT");
      if (!existingOrder) {
        res.status(500).json({ message: "Unable to load the existing order." });
        return;
      }
      res.status(200).json(toOrderResponse(existingOrder, trackingToken));
      return;
    }

    let tableId: number | null = null;
    if (input.fulfillmentType === "TABLE") {
      if (!input.tableNumber) {
        await client.query("ROLLBACK");
        res.status(400).json({ message: "A table number is required for table orders." });
        return;
      }
      const tableResult = await client.query(
        `SELECT id FROM restaurant_tables
         WHERE table_number = $1 AND is_active IS TRUE
         FOR KEY SHARE`,
        [input.tableNumber],
      );
      if (!tableResult.rows[0]) {
        await client.query("ROLLBACK");
        res.status(400).json({ message: "Select an active restaurant table." });
        return;
      }
      tableId = tableResult.rows[0].id;
    }

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const productsResult = await client.query(
      `SELECT p.id AS product_id, p.name AS product_name,
              (p.availability_status = 'AVAILABLE' AND p.archived_at IS NULL) AS available,
              v.size, v.price
       FROM products p
       JOIN product_variants v ON v.product_id = p.id
       WHERE p.id = ANY($1::varchar[]) AND p.archived_at IS NULL
       FOR SHARE OF p, v`,
      [productIds],
    );
    const currentPrices = new Map<string, { name: string; price: number; available: boolean }>();
    for (const row of productsResult.rows) {
      currentPrices.set(`${row.product_id}\u0000${row.size}`, {
        name: row.product_name,
        price: Number(row.price),
        available: row.available === true,
      });
    }

    const pricedItems: PricedItem[] = [];
    for (const item of input.items) {
      const current = currentPrices.get(`${item.productId}\u0000${item.size}`);
      if (!current?.available || !Number.isSafeInteger(current.price)) {
        await client.query("ROLLBACK");
        res.status(400).json({
          message: "One or more selected products or sizes are unavailable.",
        });
        return;
      }
      pricedItems.push({
        productId: item.productId,
        productName: current.name,
        size: item.size,
        quantity: item.quantity,
        unitPrice: current.price,
      });
    }

    const totalAmount = calculateTotal(pricedItems);
    const inserted = await client.query(
      `INSERT INTO orders
         (customer_name, customer_phone, table_id, fulfillment_type, total_amount,
          payment_status, order_status, idempotency_key, request_hash,
          tracking_token_hash)
       VALUES ($1, $2, $3, $4, $5, 'PENDING_PAYMENT', 'PLACED', $6, $7, $8)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        input.customerName,
        input.customerPhone || null,
        tableId,
        input.fulfillmentType,
        totalAmount,
        input.idempotencyKey,
        requestHash,
        trackingTokenHash,
      ],
    );

    if (!inserted.rows[0]) {
      const existingResult = await client.query(
        `SELECT request_hash, tracking_token_hash
         FROM orders WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      );
      const existing = existingResult.rows[0];
      if (
        !existing ||
        !hashesMatch(existing.request_hash, requestHash) ||
        !hashesMatch(existing.tracking_token_hash, trackingTokenHash)
      ) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message: "This checkout key was already used for a different order.",
        });
        return;
      }

      const order = await loadOrderInTransaction(client, input.idempotencyKey);
      await client.query("COMMIT");
      res.status(200).json(toOrderResponse(order, trackingToken));
      return;
    }

    const orderId = inserted.rows[0].id as string;
    for (const item of pricedItems) {
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, size, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          orderId,
          item.productId,
          item.productName,
          item.size,
          item.quantity,
          item.unitPrice,
        ],
      );
    }
    await client.query(
      `INSERT INTO payments
         (order_id, transaction_reference, payment_status, payment_source)
       VALUES ($1, NULL, 'PENDING_PAYMENT', 'MANUAL_UPI')`,
      [orderId],
    );

    await client.query("COMMIT");
    const order = await loadOrder(orderId);
    if (!order) {
      res.status(500).json({ message: "Order was created but could not be loaded." });
      return;
    }
    res.status(201).json(toOrderResponse(order, trackingToken));
  } catch (error) {
    logOrderCreationError(error);
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The connection may already have rolled back after a database failure.
      }
    }
    res.status(500).json({ message: "Unable to submit your order. Please retry safely." });
  } finally {
    client?.release();
  }
});

router.post(
  "/orders/:orderId/demo-payment",
  limitDemoPayments,
  async (req, res) => {
    if (!demoPaymentsEnabled()) {
      res.status(404).json({ message: "Not found." });
      return;
    }

    const orderIdResult = z.string().uuid().safeParse(req.params.orderId);
    const token = getBearerToken(req);
    if (!orderIdResult.success || !token) {
      res.status(404).json({ message: "Order not found." });
      return;
    }

    let client;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      const orderResult = await client.query(
        `SELECT id, payment_status, order_status, tracking_token_hash
         FROM orders WHERE id = $1 FOR UPDATE`,
        [orderIdResult.data],
      );
      const order = orderResult.rows[0];
      if (!order || !hashesMatch(order.tracking_token_hash, hash(token))) {
        await client.query("ROLLBACK");
        res.status(404).json({ message: "Order not found." });
        return;
      }

      if (order.payment_status === "PAID") {
        const paymentResult = await client.query(
          `SELECT payment_source FROM payments
           WHERE order_id = $1 LIMIT 1`,
          [order.id],
        );
        await client.query("COMMIT");
        if (paymentResult.rows[0]?.payment_source !== "DEMO") {
          res.status(409).json({
            message: "This order has already been paid through another source.",
          });
          return;
        }
        res.status(200).json({
          orderId: order.id,
          paymentStatus: "PAID",
          paymentSource: "DEMO",
          orderStatus: order.order_status,
        });
        return;
      }

      if (
        order.order_status === "CANCELLED" ||
        order.payment_status !== "PENDING_PAYMENT"
      ) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message:
            order.order_status === "CANCELLED"
              ? "Cancelled orders cannot be paid."
              : "This order is not eligible for demo payment.",
        });
        return;
      }

      const paymentResult = await client.query(
        `UPDATE payments
         SET payment_status = 'PAID',
             payment_source = 'DEMO',
             paid_at = COALESCE(paid_at, NOW()),
             transaction_reference = NULL
         WHERE order_id = $1 AND payment_status = 'PENDING_PAYMENT'`,
        [order.id],
      );
      if (paymentResult.rowCount !== 1) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message: "The demo payment could not be recorded for this order.",
        });
        return;
      }

      await client.query(
        `UPDATE orders
         SET payment_status = 'PAID', paid_at = COALESCE(paid_at, NOW())
         WHERE id = $1`,
        [order.id],
      );
      await client.query("COMMIT");
      res.status(200).json({
        orderId: order.id,
        paymentStatus: "PAID",
        paymentSource: "DEMO",
        orderStatus: order.order_status,
      });
    } catch {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The transaction may already have been rolled back by PostgreSQL.
        }
      }
      res.status(500).json({ message: "Unable to record the demo payment." });
    } finally {
      client?.release();
    }
  },
);

router.post("/orders/:orderId/payment-claim", limitOrders, async (req, res) => {
  const orderId = z.string().uuid().safeParse(req.params.orderId);
  const parsedBody = z.object({
    transactionReference: z.string().trim().min(6).max(120)
      .regex(/^[A-Za-z0-9/-]+$/),
  }).safeParse(req.body);
  const token = getBearerToken(req);
  if (!orderId.success || !parsedBody.success || !token) {
    res.status(400).json({ message: "Enter a valid UPI transaction reference." });
    return;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT o.payment_status, o.order_status, o.tracking_token_hash,
              p.payment_status AS recorded_payment_status,
              p.transaction_reference, p.payment_source
       FROM orders o
       JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1
       FOR UPDATE OF o, p`,
      [orderId.data],
    );
    const order = result.rows[0];
    if (!order || !hashesMatch(order.tracking_token_hash, hash(token))) {
      await client.query("ROLLBACK");
      res.status(404).json({ message: "Order not found." });
      return;
    }
    if (order.order_status === "CANCELLED") {
      await client.query("ROLLBACK");
      res.status(409).json({ message: "Cancelled orders cannot submit payment claims." });
      return;
    }
    if (
      order.recorded_payment_status === "PENDING_VERIFICATION" &&
      order.payment_source === "MANUAL_UPI" &&
      order.transaction_reference === parsedBody.data.transactionReference
    ) {
      await client.query("COMMIT");
      res.status(200).json({
        orderId: orderId.data,
        paymentStatus: "PENDING_VERIFICATION",
      });
      return;
    }
    if (
      order.payment_status !== "PENDING_PAYMENT" ||
      order.recorded_payment_status !== "PENDING_PAYMENT"
    ) {
      await client.query("ROLLBACK");
      res.status(409).json({
        message: "This order cannot accept another payment claim.",
      });
      return;
    }

    await client.query(
      `UPDATE payments
       SET transaction_reference = $2,
           payment_status = 'PENDING_VERIFICATION',
           payment_source = 'MANUAL_UPI'
       WHERE order_id = $1`,
      [orderId.data, parsedBody.data.transactionReference],
    );
    await client.query(
      `UPDATE orders SET payment_status = 'PENDING_VERIFICATION'
       WHERE id = $1`,
      [orderId.data],
    );
    await client.query("COMMIT");
    res.status(200).json({
      orderId: orderId.data,
      paymentStatus: "PENDING_VERIFICATION",
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction may already have been rolled back.
    }
    console.error("Customer payment claim failed", {
      code: (error as { code?: string }).code,
    });
    res.status(500).json({ message: "Unable to submit the payment claim." });
  } finally {
    client.release();
  }
});

router.get("/orders/:orderId", limitTracking, async (req, res) => {
  const orderIdResult = z.string().uuid().safeParse(req.params.orderId);
  const token = req.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{40,128})$/)?.[1];
  if (!orderIdResult.success || !token) {
    res.status(404).json({ message: "Order not found." });
    return;
  }

  try {
    const accessResult = await db.query(
      `SELECT tracking_token_hash
       FROM orders WHERE id = $1`,
      [orderIdResult.data],
    );
    const expectedHash = accessResult.rows[0]?.tracking_token_hash as string | undefined;
    if (!expectedHash || !hashesMatch(expectedHash, hash(token))) {
      res.status(404).json({ message: "Order not found." });
      return;
    }

    const order = await loadOrder(orderIdResult.data);
    if (!order) {
      res.status(404).json({ message: "Order not found." });
      return;
    }
    const paymentDetails =
      order.payment_status === "PENDING_PAYMENT" &&
      order.order_status !== "CANCELLED"
        ? await createPaymentDetails(Number(order.total_amount))
        : null;
    res.json({
      ...toOrderResponse(order),
      paymentDetails,
      demoPaymentsEnabled: demoPaymentsEnabled(),
    });
  } catch {
    res.status(500).json({ message: "Unable to load order status." });
  }
});

export default router;
