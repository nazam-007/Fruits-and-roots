import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { db } from "../db";
import { razorpayConfig, razorpayGateway, verifyRazorpaySignature } from "../razorpay";
import { PaymentError, razorpayPayments } from "../razorpayPayments";
import { publishOrderStatus } from "../orderStatusEvents";
import { logRazorpayFailure, markRazorpayFailure } from "../razorpayDiagnostics";

const router = Router();
const counts = new Map<string, { count: number; until: number }>();
const limit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  if (counts.size > 10000) for (const [key, value] of counts) if (value.until <= now) counts.delete(key);
  const key = req.ip || "unknown";
  const entry = counts.get(key);
  const value = entry && entry.until > now ? entry : { count: 0, until: now + 60000 };
  counts.set(key, value);
  if (++value.count > 30 || counts.size > 10001) { res.status(429).json({ message: "Too many gateway requests" }); return; }
  next();
};
function service() {
  if (process.env.NODE_ENV === "production") throw new PaymentError(404, "Not found");
  let config;
  try { config = razorpayConfig(); }
  catch (error) { markRazorpayFailure(error, "razorpay_order_validation", "configuration"); throw error; }
  if (!config) throw new PaymentError(404, "Not found");
  return { config, payments: razorpayPayments(db, razorpayGateway(config), config,
    (id) => publishOrderStatus(id, "PLACED")) };
}
function fail(res: import("express").Response, error: unknown) {
  logRazorpayFailure(error);
  if (error instanceof PaymentError) { res.status(error.status).json({ message: error.message }); return; }
  const code = (error as { code?: unknown })?.code;
  if (code === "23505") { res.status(409).json({ message: "Payment identity already recorded" }); return; }
  if (code === "42703" || code === "23514") { res.status(503).json({ message: "Razorpay testing schema is not ready; review migration 016" }); return; }
  res.status(503).json({ message: "Unable to process Razorpay test payment; retry safely" });
}
router.post("/orders/:orderId/razorpay/order", limit, async (req, res) => {
  try {
    const { payments } = service();
    const id = z.string().uuid().parse(req.params.orderId);
    const token = req.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/)?.[1];
    if (!token) throw new PaymentError(404, "Order not found");
    res.json(await payments.start(id, token));
  } catch (error) { if (error instanceof z.ZodError) res.status(400).json({ message: "Invalid order ID" }); else fail(res, error); }
});
router.post("/orders/:orderId/razorpay/verify", limit, async (req, res) => {
  try {
    const { payments } = service();
    const id = z.string().uuid().parse(req.params.orderId);
    const body = z.object({ razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
      razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/), razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i) }).parse(req.body);
    const token = req.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/)?.[1];
    if (!token) throw new PaymentError(404, "Order not found");
    res.json(await payments.verify(id, token, body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature));
  } catch (error) { if (error instanceof z.ZodError) res.status(400).json({ message: "Invalid payment verification" }); else fail(res, error); }
});
export const razorpayWebhook: RequestHandler = async (req, res) => {
  try {
    const { config, payments } = service();
    if (!config.webhookSecret) throw new PaymentError(503, "Test webhook is not configured");
    if (!Buffer.isBuffer(req.body) || !verifyRazorpaySignature(req.body, req.get("x-razorpay-signature") || "", config.webhookSecret)) {
      throw new PaymentError(400, "Invalid webhook signature");
    }
    let event: { event?: string; payload?: { payment?: { entity?: { id?: string } } } };
    try { event = JSON.parse(req.body.toString("utf8")); } catch { throw new PaymentError(400, "Invalid webhook JSON"); }
    if (!event || !["payment.captured", "payment.authorized", "payment.failed", "order.paid"].includes(event.event || "")) {
      res.json({ received: true, ignored: true }); return;
    }
    const id = event.payload?.payment?.entity?.id;
    if (!id || !/^pay_[A-Za-z0-9]+$/.test(id)) throw new PaymentError(400, "Webhook payment ID missing");
    const payment = await razorpayGateway(config).fetchPayment(id);
    if (payment.id !== id) throw new PaymentError(409, "Payment identity mismatch");
    await payments.confirm(payment);
    res.json({ received: true });
  } catch (error) { fail(res, error); }
};
export default router;
