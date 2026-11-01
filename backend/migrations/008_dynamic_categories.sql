CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_name_ci_uidx
  ON public.categories (lower(btrim(name)));

INSERT INTO public.categories (name)
SELECT DISTINCT ON (lower(btrim(p.category))) btrim(p.category)
FROM public.products AS p
WHERE NULLIF(btrim(p.category), '') IS NOT NULL
ORDER BY lower(btrim(p.category)), btrim(p.category)
ON CONFLICT (lower(btrim(name))) DO NOTHING;

INSERT INTO public.categories (name)
SELECT 'Uncategorized'
WHERE EXISTS (
  SELECT 1
  FROM public.products
  WHERE NULLIF(btrim(category), '') IS NULL
)
AND NOT EXISTS (
  SELECT 1
  FROM public.categories
  WHERE lower(name) = lower('Uncategorized')
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id uuid;

UPDATE public.products AS p
SET category_id = c.id
FROM public.categories AS c
WHERE p.category_id IS NULL
  AND lower(btrim(COALESCE(NULLIF(btrim(p.category), ''), 'Uncategorized'))) =
      lower(c.name);

ALTER TABLE public.products
  ALTER COLUMN category_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_category_id_fkey'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_category_id_fkey
      FOREIGN KEY (category_id)
      REFERENCES public.categories (id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS products_category_id_idx
  ON public.products (category_id);
