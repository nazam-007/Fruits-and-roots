ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text,
  ADD COLUMN IF NOT EXISTS table_number text;

UPDATE public.orders
SET
  order_type = CASE
    WHEN fulfillment_type = 'TABLE' THEN 'DINE_IN'
    ELSE 'TAKEAWAY'
  END,
  table_number = CASE
    WHEN fulfillment_type = 'TABLE' THEN (
      SELECT rt.table_number
      FROM public.restaurant_tables AS rt
      WHERE rt.id = orders.table_id
    )
    ELSE NULL
  END
WHERE order_type IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN order_type SET DEFAULT 'TAKEAWAY',
  ALTER COLUMN order_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_order_type_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_type_check
      CHECK (order_type IN ('TAKEAWAY', 'DINE_IN'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_takeaway_table_number_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_takeaway_table_number_check
      CHECK (order_type <> 'TAKEAWAY' OR table_number IS NULL);
  END IF;
END
$$;
