ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS sort_order integer;

WITH ordered_categories AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY lower(btrim(name)), id) - 1 AS position
  FROM public.categories
)
UPDATE public.categories AS category
SET sort_order = ordered_categories.position
FROM ordered_categories
WHERE category.id = ordered_categories.id
  AND category.sort_order IS NULL;

ALTER TABLE public.categories
  ALTER COLUMN sort_order SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS categories_sort_order_uidx
  ON public.categories (sort_order);
