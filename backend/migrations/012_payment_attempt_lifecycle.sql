ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz;

UPDATE public.orders
SET payment_expires_at = COALESCE(
  payment_expires_at,
  created_at + INTERVAL '30 minutes'
);

ALTER TABLE public.orders
  ALTER COLUMN payment_expires_at
    SET DEFAULT (NOW() + INTERVAL '30 minutes'),
  ALTER COLUMN payment_expires_at SET NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_status_check,
  ADD CONSTRAINT orders_order_status_check
    CHECK (order_status IN (
      'PENDING_PAYMENT',
      'PLACED',
      'PREPARING',
      'READY',
      'COMPLETED',
      'CANCELLED'
    ));

UPDATE public.orders
SET order_status = 'PENDING_PAYMENT'
WHERE payment_status IN (
    'PENDING_PAYMENT',
    'PENDING_VERIFICATION',
    'REJECTED',
    'EXPIRED'
  )
  AND order_status = 'PLACED';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check,
  ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN (
      'PENDING_PAYMENT',
      'PENDING_VERIFICATION',
      'PAID',
      'REJECTED',
      'CANCELLED',
      'EXPIRED'
    ));

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_payment_status_check,
  ADD CONSTRAINT payments_payment_status_check
    CHECK (payment_status IN (
      'PENDING_PAYMENT',
      'PENDING_VERIFICATION',
      'PAID',
      'REJECTED',
      'CANCELLED',
      'EXPIRED'
    ));

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reconciliation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciliation_flagged_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_pending_payment_expiry_idx
  ON public.orders (payment_expires_at)
  WHERE payment_status IN ('PENDING_PAYMENT', 'PENDING_VERIFICATION');

CREATE INDEX IF NOT EXISTS payments_reconciliation_queue_idx
  ON public.payments (payment_status, order_id)
  WHERE reconciliation_required IS TRUE
     OR transaction_reference IS NOT NULL;
