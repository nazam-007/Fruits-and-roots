-- PROPOSAL ONLY: requires 000-017. Review against target metadata before approval.
-- No new columns, backfill, automatic payment or historical record changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.orders DROP CONSTRAINT orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check CHECK
  (payment_status IN ('UNPAID','PENDING_PAYMENT','PENDING_VERIFICATION','PAID','REJECTED','CANCELLED','EXPIRED'));
ALTER TABLE public.payments DROP CONSTRAINT payments_payment_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_status_check CHECK
  (payment_status IN ('UNPAID','PENDING_PAYMENT','PENDING_VERIFICATION','PAID','REJECTED','CANCELLED','EXPIRED'));
ALTER TABLE public.payments DROP CONSTRAINT payments_source_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_source_check CHECK
  (payment_source IN ('PAY_AT_COUNTER','DEMO','MANUAL_UPI','RAZORPAY_TEST'));
-- Preserve the existing full-evidence refund invariant for paid counter cancellations.
ALTER TABLE public.payments DROP CONSTRAINT payments_refund_tracking_check;
ALTER TABLE public.payments
ADD CONSTRAINT payments_refund_tracking_check
CHECK ((
  (
    refund_status = 'NONE'
    AND refund_due_paise IS NULL
    AND refund_requested_at IS NULL
    AND refund_reference IS NULL
    AND refund_amount_paise IS NULL
    AND refund_completed_at IS NULL
    AND refund_recorded_at IS NULL
    AND refund_recorded_by IS NULL
    AND refund_evidence_note IS NULL
  )
  OR
  (
    refund_status IN ('PENDING', 'COMPLETED')
    AND payment_status = 'PAID'
    AND payment_source IN (
      'MANUAL_UPI',
      'PAY_AT_COUNTER',
      'RAZORPAY_TEST'
    )
    AND verified_at IS NOT NULL
    AND verified_by IS NOT NULL
    AND reconciliation_required IS FALSE
    AND refund_due_paise IS NOT NULL
    AND refund_due_paise > 0
    AND refund_requested_at IS NOT NULL
    AND (
      (
        refund_status = 'PENDING'
        AND refund_reference IS NULL
        AND refund_amount_paise IS NULL
        AND refund_completed_at IS NULL
        AND refund_recorded_at IS NULL
        AND refund_recorded_by IS NULL
        AND refund_evidence_note IS NULL
      )
      OR
      (
        refund_status = 'COMPLETED'
        AND refund_reference IS NOT NULL
        AND length(btrim(refund_reference))
          BETWEEN 4 AND 120
        AND refund_amount_paise IS NOT NULL
        AND refund_amount_paise = refund_due_paise
        AND refund_completed_at IS NOT NULL
        AND refund_completed_at >= refund_requested_at
        AND refund_recorded_at IS NOT NULL
        AND refund_recorded_at >= refund_completed_at
        AND refund_recorded_by IS NOT NULL
        AND length(btrim(refund_recorded_by))
          BETWEEN 1 AND 120
        AND refund_evidence_note IS NOT NULL
        AND length(btrim(refund_evidence_note))
          BETWEEN 10 AND 500
      )
    )
  )
) IS TRUE);

COMMIT;
