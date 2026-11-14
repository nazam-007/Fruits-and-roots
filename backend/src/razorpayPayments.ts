import { createHash, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { observeRazorpay } from "./razorpayDiagnostics";
import { amountInPaise, verifyRazorpaySignature, type Gateway, type GatewayPayment, type RazorpayConfig } from "./razorpay";

export class PaymentError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
type Attempt = { id: string; total_amount: number; item_total?: string; payment_status: string; order_status: string;
  payment_attempt_active: boolean; tracking_token_hash: string; payment_source: string; recorded_payment_status: string;
  razorpay_order_id: string | null; razorpay_payment_id: string | null; razorpay_key_id: string | null;
  razorpay_amount_paise: string | null; reconciliation_required: boolean };
const columns = `o.id,o.total_amount,o.payment_status,o.order_status,o.tracking_token_hash,
  (o.payment_expires_at > NOW()) AS payment_attempt_active,p.payment_source,
  p.payment_status AS recorded_payment_status,p.razorpay_order_id,p.razorpay_payment_id,p.razorpay_key_id,
  p.razorpay_amount_paise,p.reconciliation_required`;
export function requireTrackingAccess(attempt: Attempt | undefined, token: string) {
  const actual = createHash("sha256").update(token).digest("hex");
  if (!attempt?.tracking_token_hash || attempt.tracking_token_hash.length !== actual.length ||
    !timingSafeEqual(Buffer.from(attempt.tracking_token_hash), Buffer.from(actual))) throw new PaymentError(404, "Order not found");
}
export function checkGatewayBinding(attempt: Attempt, payment: GatewayPayment, config: RazorpayConfig) {
  if (attempt.payment_source !== "RAZORPAY_TEST" || attempt.razorpay_key_id !== config.keyId ||
    payment.order_id !== attempt.razorpay_order_id || payment.currency !== "INR" ||
    payment.amount !== amountInPaise(Number(attempt.total_amount)) ||
    payment.amount !== Number(attempt.razorpay_amount_paise) ||
    !/^pay_[A-Za-z0-9]+$/.test(payment.id)) throw new PaymentError(409, "Gateway payment does not match this order");
}
export function gatewayDecision(attempt: Attempt, payment: GatewayPayment) {
  if (payment.status !== "captured" || payment.captured !== true) return "pending";
  if ((payment.amount_refunded ?? 0) !== 0 || payment.refund_status) throw new PaymentError(409, "Refunded payments cannot confirm orders");
  if (attempt.recorded_payment_status === "PAID" || attempt.razorpay_payment_id) {
    if (attempt.razorpay_payment_id !== payment.id) throw new PaymentError(409, "A different payment is already recorded");
    return "duplicate";
  }
  if (attempt.reconciliation_required) throw new PaymentError(409, "Payment requires reconciliation");
  return !attempt.payment_attempt_active || ["CANCELLED", "EXPIRED", "REJECTED"].includes(attempt.payment_status) ||
    attempt.order_status !== "PENDING_PAYMENT" ? "reconcile" : "place";
}
export function razorpayPayments(database: Pool, gateway: Gateway, config: RazorpayConfig,
  publish: (id: string) => void) {
  async function transaction<T>(body: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await observeRazorpay("razorpay_database_transaction", "database", () => database.connect());
    try { await observeRazorpay("razorpay_database_transaction", "database", () => client.query("BEGIN")); const result = await body(client); await observeRazorpay("razorpay_database_transaction", "database", () => client.query("COMMIT")); return result; }
    catch (error) { try { await client.query("ROLLBACK"); } catch { /* Preserve original error. */ } throw error; }
    finally { client.release(); }
  }
  async function start(id: string, token: string) {
    return transaction(async (client) => {
      const attempt = (await observeRazorpay("razorpay_schema_check", "database", () => client.query(`SELECT ${columns},
        (SELECT SUM(quantity::bigint*unit_price) FROM order_items WHERE order_id=o.id)::text AS item_total
        FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=$1 FOR UPDATE OF o,p`, [id]))).rows[0] as Attempt;
      requireTrackingAccess(attempt, token);
      if (!attempt.payment_attempt_active || attempt.payment_status !== "PENDING_PAYMENT" ||
        attempt.order_status !== "PENDING_PAYMENT" || attempt.recorded_payment_status !== "PENDING_PAYMENT" ||
        !["MANUAL_UPI", "RAZORPAY_TEST"].includes(attempt.payment_source)) throw new PaymentError(409, "Payment attempt is not active");
      const amount = amountInPaise(Number(attempt.total_amount));
      if (Number(attempt.item_total) !== Number(attempt.total_amount)) throw new PaymentError(409, "Stored order pricing mismatch");
      let gatewayOrderId = attempt.razorpay_order_id;
      if (gatewayOrderId) {
        if (attempt.payment_source !== "RAZORPAY_TEST" || attempt.razorpay_key_id !== config.keyId ||
          Number(attempt.razorpay_amount_paise) !== amount) throw new PaymentError(409, "Gateway configuration changed");
      } else {
        const remote = await observeRazorpay("razorpay_gateway_order_creation", "gateway", () => gateway.createOrder(amount, id));
        if (!/^order_[A-Za-z0-9]+$/.test(remote.id) || remote.amount !== amount || remote.currency !== "INR") throw new PaymentError(502, "Invalid gateway order");
        gatewayOrderId = remote.id;
        await observeRazorpay("razorpay_order_persistence", "database", () => client.query(`UPDATE payments SET payment_source='RAZORPAY_TEST',razorpay_order_id=$2,
          razorpay_key_id=$3,razorpay_amount_paise=$4,razorpay_last_status='created' WHERE order_id=$1`,
        [id, gatewayOrderId, config.keyId, amount]));
      }
      return { keyId: config.keyId, razorpayOrderId: gatewayOrderId, amount, currency: "INR", testMode: true };
    });
  }
  async function confirm(payment: GatewayPayment) {
    const result = await transaction(async (client) => {
      const attempt = (await client.query(`SELECT ${columns} FROM orders o JOIN payments p ON p.order_id=o.id
        WHERE p.razorpay_order_id=$1 FOR UPDATE OF o,p`, [payment.order_id])).rows[0] as Attempt | undefined;
      if (!attempt) throw new PaymentError(404, "Gateway order not found");
      checkGatewayBinding(attempt, payment, config);
      const decision = gatewayDecision(attempt, payment);
      if (decision === "pending") {
        if (attempt.recorded_payment_status !== "PAID" && !attempt.razorpay_payment_id) await client.query(
          "UPDATE payments SET razorpay_last_status=$2 WHERE order_id=$1", [attempt.id,
            ["created", "authorized", "failed"].includes(payment.status) ? payment.status : "pending"]);
        return { orderId: attempt.id, paymentStatus: attempt.payment_status, gatewayStatus: payment.status, placed: false };
      }
      if (decision === "duplicate") return { orderId: attempt.id, paymentStatus: attempt.payment_status, placed: false };
      const stale = decision === "reconcile";
      const status = stale ? (attempt.payment_status === "CANCELLED" ? "CANCELLED" : "EXPIRED") : "PAID";
      await client.query(`UPDATE payments SET payment_status=$2,razorpay_payment_id=$3,razorpay_last_status='captured',
        paid_at=NOW(),verified_at=NOW(),verified_by='RAZORPAY_TEST',reconciliation_required=$4,
        reconciliation_flagged_at=CASE WHEN $4 THEN NOW() ELSE NULL END WHERE order_id=$1`, [attempt.id, status, payment.id, stale]);
      await client.query(`UPDATE orders SET payment_status=$2,
        order_status=CASE WHEN $3::boolean THEN 'PLACED' ELSE order_status END,
        paid_at=CASE WHEN $3::boolean THEN NOW() ELSE paid_at END WHERE id=$1`, [attempt.id, status, !stale]);
      return { orderId: attempt.id, paymentStatus: status, reconciliationRequired: stale, placed: !stale };
    });
    if (result.placed) publish(result.orderId);
    return result;
  }
  async function verify(id: string, token: string, remoteOrderId: string, paymentId: string, signature: string) {
    const attempt = (await database.query(`SELECT ${columns} FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=$1`, [id])).rows[0] as Attempt;
    requireTrackingAccess(attempt, token);
    if (attempt.razorpay_order_id !== remoteOrderId || attempt.razorpay_key_id !== config.keyId ||
      !verifyRazorpaySignature(`${attempt.razorpay_order_id}|${paymentId}`, signature, config.secret)) throw new PaymentError(400, "Invalid payment signature");
    const payment = await gateway.fetchPayment(paymentId);
    if (payment.id !== paymentId || payment.order_id !== remoteOrderId) throw new PaymentError(409, "Payment identity mismatch");
    return confirm(payment);
  }
  return { start, verify, confirm };
}
