// These aliases are internal SQL identifiers, never request input.
export function operationalPaymentPredicate(alias: "o" | "orders") {
  const paid = `${alias}.payment_status = 'PAID'`;
  if (process.env.NODE_ENV !== "production") return paid;
  return `${paid}
    AND EXISTS (
      SELECT 1 FROM payments verified_payment
      WHERE verified_payment.order_id = ${alias}.id
        AND verified_payment.payment_status = 'PAID'
        AND verified_payment.payment_source = 'MANUAL_UPI'
        AND verified_payment.verified_at IS NOT NULL
        AND verified_payment.verified_by IS NOT NULL
        AND verified_payment.verified_transaction_reference IS NOT NULL
        AND verified_payment.reconciliation_required IS FALSE
    )`;
}
