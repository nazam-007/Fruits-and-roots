CREATE SEQUENCE IF NOT EXISTS order_number_seq;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

UPDATE orders
SET order_number = 'FR-' || lpad(nextval('order_number_seq')::text, 8, '0')
WHERE order_number IS NULL;

ALTER TABLE orders
  ALTER COLUMN order_number
    SET DEFAULT ('FR-' || lpad(nextval('order_number_seq')::text, 8, '0')),
  ALTER COLUMN order_number SET NOT NULL,
  ALTER COLUMN payment_status SET DEFAULT 'PENDING_PAYMENT';

ALTER SEQUENCE order_number_seq OWNED BY orders.order_number;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_uidx
  ON orders (order_number);

ALTER TABLE payments
  ALTER COLUMN transaction_reference DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS payment_source varchar(20) NOT NULL DEFAULT 'MANUAL_UPI',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_payment_status_check'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
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
    WHERE conname = 'payments_source_check'
      AND conrelid = 'payments'::regclass
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_source_check
      CHECK (payment_source IN ('DEMO', 'MANUAL_UPI'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_payment_status_check'
      AND conrelid = 'payments'::regclass
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_payment_status_check
      CHECK (payment_status IN (
        'PENDING_PAYMENT',
        'PENDING_VERIFICATION',
        'PAID',
        'REJECTED'
      ));
  END IF;
END
$$;
