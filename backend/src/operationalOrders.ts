// These aliases are internal SQL identifiers, never request input.
export function operationalPaymentPredicate(alias: "o" | "orders") {
  const paid = `${alias}.payment_status = 'PAID'`;
  const counter = `(${alias}.payment_status IN ('UNPAID','PAID') AND EXISTS (
    SELECT 1 FROM payments counter_payment WHERE counter_payment.order_id=${alias}.id
    AND counter_payment.payment_source='PAY_AT_COUNTER'
    AND counter_payment.payment_status=${alias}.payment_status
    AND counter_payment.reconciliation_required IS FALSE
    AND (${alias}.payment_status='UNPAID' OR (counter_payment.verified_at IS NOT NULL AND counter_payment.verified_by IS NOT NULL))
  ))`;
  if (process.env.NODE_ENV !== "production") return `(${paid} OR ${counter})`;
  return `(${counter} OR (${paid}
    AND EXISTS (
      SELECT 1 FROM payments verified_payment
      WHERE verified_payment.order_id = ${alias}.id
        AND verified_payment.payment_status = 'PAID'
        AND verified_payment.payment_source = 'MANUAL_UPI'
        AND verified_payment.verified_at IS NOT NULL
        AND verified_payment.verified_by IS NOT NULL
        AND verified_payment.verified_transaction_reference IS NOT NULL
        AND verified_payment.reconciliation_required IS FALSE
    )))`;
}
