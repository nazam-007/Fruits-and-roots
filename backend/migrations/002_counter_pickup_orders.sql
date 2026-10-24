ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_type varchar(20);

UPDATE orders
SET fulfillment_type = CASE
  WHEN table_id IS NULL THEN 'PICKUP'
  ELSE 'TABLE'
END
WHERE fulfillment_type IS NULL;

ALTER TABLE orders
  ALTER COLUMN fulfillment_type SET DEFAULT 'PICKUP',
  ALTER COLUMN fulfillment_type SET NOT NULL,
  ALTER COLUMN table_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_fulfillment_type_check'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_fulfillment_type_check
      CHECK (fulfillment_type IN ('PICKUP', 'TABLE'));
  END IF;
END
$$;
