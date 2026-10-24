ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS availability_status varchar(20),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE public.products
SET availability_status = CASE
  WHEN available IS TRUE THEN 'AVAILABLE'
  ELSE 'COMING_SOON'
END
WHERE availability_status IS NULL;

ALTER TABLE public.products
  ALTER COLUMN availability_status SET DEFAULT 'AVAILABLE',
  ALTER COLUMN availability_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_availability_status_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_availability_status_check
      CHECK (availability_status IN ('AVAILABLE', 'SOLD_OUT', 'COMING_SOON'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS products_active_category_name_idx
  ON public.products (category, name)
  WHERE archived_at IS NULL;
