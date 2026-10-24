CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number varchar(32),
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS request_hash char(64),
  ADD COLUMN IF NOT EXISTS tracking_token_hash char(64),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

UPDATE public.orders
SET order_number = 'FR-' || lpad(nextval('public.order_number_seq')::text, 8, '0')
WHERE order_number IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN order_number
    SET DEFAULT ('FR-' || lpad(nextval('public.order_number_seq')::text, 8, '0')),
  ALTER COLUMN order_number SET NOT NULL,
  ALTER COLUMN payment_status SET DEFAULT 'PENDING_PAYMENT';

DO $$
DECLARE
  sequence_value bigint;
  highest_order_number bigint;
BEGIN
  SELECT last_value INTO sequence_value FROM public.order_number_seq;
  SELECT COALESCE(
    MAX(substring(order_number FROM '^FR-([0-9]+)$')::bigint),
    0
  )
  INTO highest_order_number
  FROM public.orders;

  PERFORM setval(
    'public.order_number_seq',
    GREATEST(sequence_value, highest_order_number, 1),
    true
  );
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_uidx
  ON public.orders (order_number);

CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_uidx
  ON public.orders (idempotency_key);

ALTER TABLE public.payments
  ALTER COLUMN transaction_reference DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS payment_source varchar(20) NOT NULL DEFAULT 'MANUAL_UPI',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.payments
  ALTER COLUMN payment_status SET DEFAULT 'PENDING_PAYMENT';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_payment_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN (
        'PENDING_PAYMENT',
        'PENDING_VERIFICATION',
        'PAID',
        'REJECTED'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_payment_status_check'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_payment_status_check
      CHECK (payment_status IN (
        'PENDING_PAYMENT',
        'PENDING_VERIFICATION',
        'PAID',
        'REJECTED'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_source_check'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_source_check
      CHECK (payment_source IN ('DEMO', 'MANUAL_UPI'));
  END IF;
END
$$;
