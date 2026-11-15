import { timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

export class RefundError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

// Fixed aliases only. to_jsonb keeps read endpoints compatible before migration 017;
// paid cancellation/refund writes fail closed until the refund fields are installed.
export function refundProjection(alias: "p", admin = false) {
  return `jsonb_build_object('status',COALESCE(to_jsonb(${alias})->>'refund_status','UNAVAILABLE'),
    'amountPaise',to_jsonb(${alias})->'refund_due_paise',
    'completedAt',to_jsonb(${alias})->'refund_completed_at',
    'testMode',${alias}.payment_source='RAZORPAY_TEST'
    ${admin ? `,'reference',to_jsonb(${alias})->'refund_reference',
    'recordedAt',to_jsonb(${alias})->'refund_recorded_at',
    'recordedBy',to_jsonb(${alias})->'refund_recorded_by',
    'evidenceNote',to_jsonb(${alias})->'refund_evidence_note'` : ""})`;
}

// Every cancellation/preparation/refund writer locks the order FIRST, payment SECOND.
export async function lockOrderPayment(client: PoolClient, id: string) {
  const order = (await client.query(
    "SELECT id,order_status,payment_status,total_amount,tracking_token_hash FROM orders WHERE id=$1 FOR UPDATE", [id])).rows[0];
  if (!order) return undefined;
  const payment = (await client.query(`SELECT p.*,to_jsonb(p)->>'refund_status' AS refund_status
    FROM payments p WHERE p.order_id=$1 FOR UPDATE`, [id])).rows[0];
  if (!payment) throw new RefundError(409, "Payment record requires review.");
  return { ...order, payment };
}

function eligible(order: NonNullable<Awaited<ReturnType<typeof lockOrderPayment>>>) {
  const p = order.payment;
  const orderPaid = order.payment_status === "PAID", paymentPaid = p.payment_status === "PAID";
  if (orderPaid !== paymentPaid) throw new RefundError(409, "Payment records require reconciliation before cancellation.");
  if (!orderPaid || p.payment_source === "DEMO") return false;
  if (!p.verified_at || !p.verified_by || p.reconciliation_required !== false ||
      !(p.payment_source === "MANUAL_UPI" ? p.verified_transaction_reference :
        p.payment_source === "RAZORPAY_TEST" && p.razorpay_payment_id)) {
    throw new RefundError(409, "Trusted payment evidence requires review before cancellation.");
  }
  return true;
}

async function transaction<T>(db: Pool, body: (client: PoolClient) => Promise<T>) {
  const client = await db.connect();
  try { await client.query("BEGIN"); const result = await body(client); await client.query("COMMIT"); return result; }
  catch (error) { try { await client.query("ROLLBACK"); } catch { /* Preserve primary failure. */ } throw error; }
  finally { client.release(); }
}

function sameHash(a: unknown, b: string) {
  return typeof a === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function cancelWithRefund(db: Pool, id: string, trackingHash: string) {
  return transaction(db, async client => {
    const order = await lockOrderPayment(client, id);
    if (!order || !sameHash(order.tracking_token_hash, trackingHash)) throw new RefundError(404, "Order not found.");
    if (order.order_status === "CANCELLED") return {
      orderId: id, orderStatus: "CANCELLED" as const, changed: false,
      refundReviewRequired: order.payment.refund_status === "PENDING",
    };
    if (order.order_status !== "PLACED") throw new RefundError(409, "Only an Order Placed order can be cancelled; preparation may already have started.");
    const refundRequired = eligible(order);
    if (refundRequired && order.payment.refund_status !== "NONE") {
      throw new RefundError(order.payment.refund_status == null ? 503 : 409,
        order.payment.refund_status == null ? "Refund tracking schema is not ready; review migration 017." : "Refund record requires review.");
    }
    if (refundRequired) {
      const due = Number(order.total_amount) * 100;
      if (!Number.isSafeInteger(due) || due <= 0) throw new RefundError(409, "Stored payment amount requires review.");
      const refund = await client.query(`UPDATE payments SET refund_status='PENDING',refund_due_paise=$2,
        refund_requested_at=NOW() WHERE order_id=$1 AND refund_status='NONE' RETURNING order_id`, [id, due]);
      if (refund.rowCount !== 1) throw new RefundError(409, "Refund state changed. Refresh before retrying.");
    }
    const cancelled = await client.query(`UPDATE orders SET order_status='CANCELLED'
      WHERE id=$1 AND order_status='PLACED' RETURNING id`, [id]);
    if (cancelled.rowCount !== 1) throw new RefundError(409, "Order status changed. Refresh before retrying.");
    return { orderId: id, orderStatus: "CANCELLED" as const, changed: true, refundReviewRequired: refundRequired };
  });
}

export const manualRefundSchema = z.object({
  reference: z.string().trim().min(4).max(120).regex(/^[A-Za-z0-9/-]+$/),
  amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  completedAt: z.string().datetime({ offset: true }),
  evidenceNote: z.string().trim().min(10).max(500),
  moneyReturnedConfirmed: z.literal(true),
}).strict();

export async function recordManualRefund(db: Pool, id: string, adminId: string, input: z.infer<typeof manualRefundSchema>, now = Date.now()) {
  input = manualRefundSchema.parse(input);
  if (!adminId || adminId.length > 120) throw new RefundError(401, "Authorized admin required.");
  if (Date.parse(input.completedAt) > now) throw new RefundError(400, "Refund completion cannot be in the future.");
  return transaction(db, async client => {
    const order = await lockOrderPayment(client, id);
    if (!order) throw new RefundError(404, "Order not found.");
    if (order.order_status !== "CANCELLED" || !eligible(order)) throw new RefundError(409, "Only a cancelled, trusted paid order can have a completed refund.");
    const p = order.payment;
    if (p.refund_status == null) throw new RefundError(503, "Refund tracking schema is not ready; review migration 017.");
    if (p.refund_status === "COMPLETED") {
      if (p.refund_reference !== input.reference || Number(p.refund_amount_paise) !== input.amountPaise ||
          new Date(p.refund_completed_at).getTime() !== Date.parse(input.completedAt) || p.refund_evidence_note !== input.evidenceNote)
        throw new RefundError(409, "A different refund is already recorded.");
      return { refundStatus: "COMPLETED" as const, duplicate: true };
    }
    if (p.refund_status !== "PENDING" || input.amountPaise !== Number(p.refund_due_paise) ||
        input.amountPaise !== Number(order.total_amount) * 100) throw new RefundError(409, "The full pending refund amount must match the paid order.");
    if (Date.parse(input.completedAt) < new Date(p.refund_requested_at).getTime())
      throw new RefundError(400, "Refund completion cannot predate cancellation.");
    const updated = await client.query(`UPDATE payments SET refund_status='COMPLETED',refund_reference=$2,
      refund_amount_paise=$3,refund_completed_at=$4,refund_recorded_at=clock_timestamp(),
      refund_recorded_by=$5,refund_evidence_note=$6
      WHERE order_id=$1 AND refund_status='PENDING' RETURNING order_id`,
    [id, input.reference, input.amountPaise, input.completedAt, adminId, input.evidenceNote]);
    if (updated.rowCount !== 1) throw new RefundError(409, "Refund state changed. Refresh before retrying.");
    return { refundStatus: "COMPLETED" as const, duplicate: false };
  });
}
