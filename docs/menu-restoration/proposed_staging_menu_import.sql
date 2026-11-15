-- PROPOSAL ONLY. Never run against either existing project.
-- Future separately approved staging target; no connection/project is selected here.
-- Default execution refuses an unset approval reference and ends in ROLLBACK.
-- Read MENU_RESTORATION_REVIEW.md before separately authorizing execution.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;
DO $$
DECLARE
  approved_staging_ref constant text := 'UNAPPROVED_STAGING_PROJECT_REF';
BEGIN
  IF approved_staging_ref = 'UNAPPROVED_STAGING_PROJECT_REF'
     OR approved_staging_ref IN ('mrjsfznxbwjsdzyuzvsi','wznkpgpexjexxzptuuwp')
     OR approved_staging_ref !~ '^[a-z]{20}$' THEN
    RAISE EXCEPTION 'STOP: a different staging project and exact execution must be separately approved';
  END IF;
END $$;
-- This declaration is an operator approval guard, NOT proof of Supabase identity.
-- Independently verify dashboard/connection identity before any authorized run.
-- Run offline in staging; refuse competing menu writers instead of racing them.
LOCK TABLE public.categories, public.products, public.product_variants
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE fr_restore_categories (
  name text PRIMARY KEY, sort_order integer UNIQUE NOT NULL
) ON COMMIT DROP;
INSERT INTO pg_temp.fr_restore_categories (name,sort_order) VALUES
  ('Liquid Therapy',0),('Fruitopia',1),('Guilty Pleasures',2),('Bread & Bite',3);
CREATE TEMP TABLE fr_restore_menu (
  id varchar(100) PRIMARY KEY, name varchar(150) NOT NULL, category text NOT NULL,
  regular_price integer, large_price integer, available boolean NOT NULL,
  availability_status varchar(20) NOT NULL, featured boolean NOT NULL
) ON COMMIT DROP;
INSERT INTO pg_temp.fr_restore_menu
  (id,name,category,regular_price,large_price,available,availability_status,featured)
VALUES
  ('drink-banana', 'Banana', 'Liquid Therapy', 129, 248, true, 'AVAILABLE', false),
  ('drink-date', 'Date', 'Liquid Therapy', 139, 268, true, 'AVAILABLE', false),
  ('drink-date-&-banana', 'Date & Banana', 'Liquid Therapy', 149, 288, true, 'AVAILABLE', true),
  ('drink-mango', 'Mango', 'Liquid Therapy', 149, 288, true, 'AVAILABLE', true),
  ('drink-kiwi', 'Kiwi', 'Liquid Therapy', 159, 308, true, 'AVAILABLE', false),
  ('drink-dry-fruit', 'Dry Fruit', 'Liquid Therapy', 159, 308, true, 'AVAILABLE', true),
  ('drink-dragon', 'Dragon', 'Liquid Therapy', 169, 328, true, 'AVAILABLE', false),
  ('drink-blueberry', 'Blueberry', 'Liquid Therapy', 169, 328, true, 'AVAILABLE', false),
  ('drink-strawberry', 'Strawberry', 'Liquid Therapy', 169, 328, true, 'AVAILABLE', false),
  ('drink-avocado', 'Avocado', 'Liquid Therapy', 199, 388, true, 'AVAILABLE', true),
  ('drink-pineapple', 'Pineapple', 'Liquid Therapy', 89, 168, true, 'AVAILABLE', true),
  ('drink-mosambi', 'Mosambi', 'Liquid Therapy', 89, 168, true, 'AVAILABLE', false),
  ('drink-watermelon', 'Watermelon', 'Liquid Therapy', 89, 168, true, 'AVAILABLE', false),
  ('drink-beetroot', 'Beetroot', 'Liquid Therapy', 59, 108, true, 'AVAILABLE', false),
  ('drink-abc', 'ABC', 'Liquid Therapy', 99, 188, true, 'AVAILABLE', false),
  ('drink-grape', 'Grape', 'Liquid Therapy', 129, 248, true, 'AVAILABLE', false),
  ('drink-mix-fruit', 'Mix Fruit', 'Liquid Therapy', 129, 248, true, 'AVAILABLE', true),
  ('drink-anar', 'Anar', 'Liquid Therapy', 129, 248, true, 'AVAILABLE', false),
  ('drink-orange', 'Orange', 'Liquid Therapy', 149, 288, true, 'AVAILABLE', true),
  ('drink-apple', 'Apple', 'Liquid Therapy', 169, 328, true, 'AVAILABLE', false),
  ('drink-lassi', 'Lassi', 'Liquid Therapy', 69, 128, true, 'AVAILABLE', false),
  ('drink-cold-coffee', 'Cold Coffee', 'Liquid Therapy', 159, 308, true, 'AVAILABLE', true),
  ('drink-persian-tea', 'Persian Tea', 'Liquid Therapy', 35, 60, true, 'AVAILABLE', false),
  ('drink-turkish-tea', 'Turkish Tea', 'Liquid Therapy', NULL, NULL, false, 'COMING_SOON', false),
  ('drink-filter-coffee', 'Filter Coffee', 'Liquid Therapy', NULL, NULL, false, 'COMING_SOON', false),
  ('mix-fruit-salad', 'Mix Fruit Salad', 'Fruitopia', 99, 149, true, 'AVAILABLE', false),
  ('exotic-fruit-salad', 'Exotic Fruit Salad', 'Fruitopia', 249, 549, true, 'AVAILABLE', true),
  ('fruit-date-delight', 'Fruit Date Delight', 'Fruitopia', 149, 199, true, 'AVAILABLE', false),
  ('biscoff-fruit-custard', 'Biscoff Fruit Custard', 'Fruitopia', 99, 188, true, 'AVAILABLE', true),
  ('brownie-strawberry', 'Brownie Strawberry', 'Guilty Pleasures', 199, 388, true, 'AVAILABLE', false),
  ('strawberry-chocolate', 'Strawberry Chocolate', 'Guilty Pleasures', 99, 169, true, 'AVAILABLE', false),
  ('single-choco-waffle', 'Single Choco Waffle', 'Guilty Pleasures', 99, 188, true, 'AVAILABLE', false),
  ('triple-choco-waffle', 'Triple Choco Waffle', 'Guilty Pleasures', 129, 248, true, 'AVAILABLE', false),
  ('fruit-choco-waffle', 'Fruit Choco Waffle', 'Guilty Pleasures', 159, 308, true, 'AVAILABLE', false),
  ('avocado-sandwich', 'Avocado Sandwich', 'Bread & Bite', 90, 170, true, 'AVAILABLE', true),
  ('paneer-sandwich', 'Paneer Sandwich', 'Bread & Bite', 99, 188, true, 'AVAILABLE', false),
  ('aalu-cheese-burger', 'Aalu Cheese Burger', 'Bread & Bite', 110, NULL, true, 'AVAILABLE', true);
-- Map normalized category names; never rewrite an existing category or sort value.
-- Existing conflicting category order requires a separate owner decision.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_temp.fr_restore_categories m JOIN public.categories c
      ON lower(btrim(c.name))=lower(btrim(m.name))
    WHERE c.sort_order IS DISTINCT FROM m.sort_order
  ) OR EXISTS (
    SELECT 1 FROM pg_temp.fr_restore_categories m JOIN public.categories c
      ON c.sort_order=m.sort_order
    WHERE lower(btrim(c.name))<>lower(btrim(m.name))
  ) THEN RAISE EXCEPTION 'Category ordering conflict: preserve existing edits and stop'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.fr_restore_menu m JOIN public.products p
      ON lower(btrim(p.name))=lower(btrim(m.name)) AND p.id<>m.id
    WHERE p.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'Existing active name uses another ID: review mapping before import'; END IF;
END $$;
INSERT INTO public.categories (name,sort_order)
SELECT m.name,m.sort_order FROM pg_temp.fr_restore_categories m
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE lower(btrim(c.name))=lower(btrim(m.name))
)
ON CONFLICT (lower(btrim(name))) DO NOTHING;

CREATE TEMP TABLE fr_restore_inserted_products (id varchar(100) PRIMARY KEY)
ON COMMIT DROP;
WITH inserted AS (
  INSERT INTO public.products
    (id,name,category,category_id,available,availability_status,featured,image_url)
  SELECT m.id,m.name,c.name,c.id,m.available,m.availability_status,m.featured,NULL
  FROM pg_temp.fr_restore_menu m
  JOIN public.categories c ON lower(btrim(c.name))=lower(btrim(m.category))
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id=m.id)
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
INSERT INTO pg_temp.fr_restore_inserted_products (id) SELECT id FROM inserted;

-- Only newly inserted products receive variants. Never overwrite prices, add
-- removed sizes, edit images or repair archived products on an existing ID.
INSERT INTO public.product_variants (product_id,size,price)
SELECT m.id,v.size,v.price
FROM pg_temp.fr_restore_menu m
JOIN pg_temp.fr_restore_inserted_products n ON n.id=m.id
CROSS JOIN LATERAL (VALUES
  ('Regular'::varchar(20),m.regular_price),('Large'::varchar(20),m.large_price)
) AS v(size,price)
WHERE v.price IS NOT NULL
ON CONFLICT (product_id,size) DO NOTHING;

SELECT count(*) AS newly_inserted_products FROM pg_temp.fr_restore_inserted_products;
SELECT m.id,m.name,p.archived_at IS NOT NULL AS archived,
       CASE WHEN n.id IS NULL THEN 'EXISTING ID PRESERVED' ELSE 'NEW INSERT' END AS action
FROM pg_temp.fr_restore_menu m
JOIN public.products p ON p.id=m.id
LEFT JOIN pg_temp.fr_restore_inserted_products n ON n.id=m.id
ORDER BY m.category,m.name;
-- EXPECTED on an otherwise empty approved staging schema: 37 new products,
-- 4 categories and 69 variants. On rerun: 0 inserts; admin edits remain intact.
-- STOP POINT: inspect output. Default is a dry run. COMMIT requires separate
-- explicit approval of the exact target, script revision and manifest.
ROLLBACK;
