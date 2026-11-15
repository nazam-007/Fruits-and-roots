-- READ-ONLY VALIDATION PROPOSAL. Not executed. Confirm the separately approved
-- staging target first. No credentials, images, financial or customer tables.
SELECT c.name,c.sort_order,count(p.id) AS products,
       count(p.id) FILTER (WHERE p.archived_at IS NULL) AS not_archived,
       count(p.id) FILTER (WHERE p.archived_at IS NULL AND p.availability_status='AVAILABLE') AS available
FROM public.categories c LEFT JOIN public.products p ON p.category_id=c.id
GROUP BY c.id,c.name,c.sort_order ORDER BY c.sort_order;
-- Empty staging import expectation: 25/4/5/3 products, order 0/1/2/3;
-- 23/4/5/3 AVAILABLE and no archived imported products.
SELECT count(*) AS variant_count FROM public.product_variants;
-- Expected: 69 when staging contains only this manifest.

WITH expected(id,name,category,regular_price,large_price,availability_status,available,featured) AS (
VALUES
  ('drink-banana', 'Banana', 'Liquid Therapy', 129, 248, 'AVAILABLE', true, false),
  ('drink-date', 'Date', 'Liquid Therapy', 139, 268, 'AVAILABLE', true, false),
  ('drink-date-&-banana', 'Date & Banana', 'Liquid Therapy', 149, 288, 'AVAILABLE', true, true),
  ('drink-mango', 'Mango', 'Liquid Therapy', 149, 288, 'AVAILABLE', true, true),
  ('drink-kiwi', 'Kiwi', 'Liquid Therapy', 159, 308, 'AVAILABLE', true, false),
  ('drink-dry-fruit', 'Dry Fruit', 'Liquid Therapy', 159, 308, 'AVAILABLE', true, true),
  ('drink-dragon', 'Dragon', 'Liquid Therapy', 169, 328, 'AVAILABLE', true, false),
  ('drink-blueberry', 'Blueberry', 'Liquid Therapy', 169, 328, 'AVAILABLE', true, false),
  ('drink-strawberry', 'Strawberry', 'Liquid Therapy', 169, 328, 'AVAILABLE', true, false),
  ('drink-avocado', 'Avocado', 'Liquid Therapy', 199, 388, 'AVAILABLE', true, true),
  ('drink-pineapple', 'Pineapple', 'Liquid Therapy', 89, 168, 'AVAILABLE', true, true),
  ('drink-mosambi', 'Mosambi', 'Liquid Therapy', 89, 168, 'AVAILABLE', true, false),
  ('drink-watermelon', 'Watermelon', 'Liquid Therapy', 89, 168, 'AVAILABLE', true, false),
  ('drink-beetroot', 'Beetroot', 'Liquid Therapy', 59, 108, 'AVAILABLE', true, false),
  ('drink-abc', 'ABC', 'Liquid Therapy', 99, 188, 'AVAILABLE', true, false),
  ('drink-grape', 'Grape', 'Liquid Therapy', 129, 248, 'AVAILABLE', true, false),
  ('drink-mix-fruit', 'Mix Fruit', 'Liquid Therapy', 129, 248, 'AVAILABLE', true, true),
  ('drink-anar', 'Anar', 'Liquid Therapy', 129, 248, 'AVAILABLE', true, false),
  ('drink-orange', 'Orange', 'Liquid Therapy', 149, 288, 'AVAILABLE', true, true),
  ('drink-apple', 'Apple', 'Liquid Therapy', 169, 328, 'AVAILABLE', true, false),
  ('drink-lassi', 'Lassi', 'Liquid Therapy', 69, 128, 'AVAILABLE', true, false),
  ('drink-cold-coffee', 'Cold Coffee', 'Liquid Therapy', 159, 308, 'AVAILABLE', true, true),
  ('drink-persian-tea', 'Persian Tea', 'Liquid Therapy', 35, 60, 'AVAILABLE', true, false),
  ('drink-turkish-tea', 'Turkish Tea', 'Liquid Therapy', NULL, NULL, 'COMING_SOON', false, false),
  ('drink-filter-coffee', 'Filter Coffee', 'Liquid Therapy', NULL, NULL, 'COMING_SOON', false, false),
  ('mix-fruit-salad', 'Mix Fruit Salad', 'Fruitopia', 99, 149, 'AVAILABLE', true, false),
  ('exotic-fruit-salad', 'Exotic Fruit Salad', 'Fruitopia', 249, 549, 'AVAILABLE', true, true),
  ('fruit-date-delight', 'Fruit Date Delight', 'Fruitopia', 149, 199, 'AVAILABLE', true, false),
  ('biscoff-fruit-custard', 'Biscoff Fruit Custard', 'Fruitopia', 99, 188, 'AVAILABLE', true, true),
  ('brownie-strawberry', 'Brownie Strawberry', 'Guilty Pleasures', 199, 388, 'AVAILABLE', true, false),
  ('strawberry-chocolate', 'Strawberry Chocolate', 'Guilty Pleasures', 99, 169, 'AVAILABLE', true, false),
  ('single-choco-waffle', 'Single Choco Waffle', 'Guilty Pleasures', 99, 188, 'AVAILABLE', true, false),
  ('triple-choco-waffle', 'Triple Choco Waffle', 'Guilty Pleasures', 129, 248, 'AVAILABLE', true, false),
  ('fruit-choco-waffle', 'Fruit Choco Waffle', 'Guilty Pleasures', 159, 308, 'AVAILABLE', true, false),
  ('avocado-sandwich', 'Avocado Sandwich', 'Bread & Bite', 90, 170, 'AVAILABLE', true, true),
  ('paneer-sandwich', 'Paneer Sandwich', 'Bread & Bite', 99, 188, 'AVAILABLE', true, false),
  ('aalu-cheese-burger', 'Aalu Cheese Burger', 'Bread & Bite', 110, NULL, 'AVAILABLE', true, true)
), actual_variants AS (
  SELECT product_id,
         max(price) FILTER (WHERE size='Regular') AS regular_price,
         max(price) FILTER (WHERE size='Large') AS large_price,
         count(*) AS variants
  FROM public.product_variants GROUP BY product_id
)
SELECT m.id,m.name,
       p.id IS NULL AS missing_product,
       p.name IS DISTINCT FROM m.name AS name_diff,
       c.name IS DISTINCT FROM m.category AS category_diff,
       p.available IS DISTINCT FROM m.available AS available_diff,
       p.availability_status IS DISTINCT FROM m.availability_status AS status_diff,
       p.featured IS DISTINCT FROM m.featured AS featured_diff,
       v.regular_price IS DISTINCT FROM m.regular_price AS regular_price_diff,
       v.large_price IS DISTINCT FROM m.large_price AS large_price_diff,
       coalesce(v.variants,0) <> ((m.regular_price IS NOT NULL)::int+(m.large_price IS NOT NULL)::int) AS variant_count_diff,
       p.archived_at IS NOT NULL AS archived
FROM expected m LEFT JOIN public.products p ON p.id=m.id
LEFT JOIN public.categories c ON c.id=p.category_id
LEFT JOIN actual_variants v ON v.product_id=m.id
ORDER BY m.category,m.name;
-- Expected: 37 rows, every difference flag false for a new clean import.
-- Existing admin edits are reported, NOT automatically fixed. Review separately.

SELECT p.id,p.name FROM public.products p LEFT JOIN public.categories c ON c.id=p.category_id
WHERE p.category_id IS NULL OR c.id IS NULL;
-- Expected: zero rows.
SELECT product_id,size,count(*) FROM public.product_variants
GROUP BY product_id,size HAVING count(*)>1;
-- Expected: zero rows.
SELECT id,name,availability_status,(archived_at IS NOT NULL) AS archived
FROM public.products WHERE lower(btrim(name))='banana shake' ORDER BY id;
-- Expected on the proposed clean staging target: zero; original project untouched.
-- An unexpected Banana Shake row is for investigation, never automatic cleanup.
