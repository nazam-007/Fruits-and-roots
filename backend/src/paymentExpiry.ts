import { db } from "./db";

const DEFAULT_EXPIRY_MINUTES = 30;
const EXPIRY_INTERVAL_MS = 60_000;

export function getPendingPaymentExpiryMinutes() {
  const configured = process.env.PENDING_PAYMENT_EXPIRY_MINUTES;
  if (configured === undefined || configured.trim() === "") {
    return DEFAULT_EXPIRY_MINUTES;
  }

  const minutes = Number(configured);
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new Error(
      "PENDING_PAYMENT_EXPIRY_MINUTES must be an integer between 1 and 1440.",
    );
  }
  return minutes;
}

export async function expirePendingPayments() {
  const result = await db.query(
    `WITH expired_orders AS (
       UPDATE public.orders
       SET payment_status = 'EXPIRED'
       WHERE payment_status IN ('PENDING_PAYMENT', 'PENDING_VERIFICATION')
         AND payment_expires_at <= NOW()
       RETURNING id
     )
     UPDATE public.payments p
     SET payment_status = 'EXPIRED'
     FROM expired_orders eo
     WHERE p.order_id = eo.id
       AND p.payment_status IN ('PENDING_PAYMENT', 'PENDING_VERIFICATION')`,
  );
  return result.rowCount ?? 0;
}

export function startPendingPaymentExpiryWorker() {
  getPendingPaymentExpiryMinutes();
  let running = false;
  const expire = async () => {
    if (running) return;
    running = true;
    try {
      await expirePendingPayments();
    } catch (error) {
      console.error("Pending payment expiry failed", {
        code: (error as { code?: string }).code,
      });
    } finally {
      running = false;
    }
  };

  void expire();
  const timer = setInterval(() => void expire(), EXPIRY_INTERVAL_MS);
  timer.unref();
  return timer;
}
