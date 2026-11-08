-- PROPOSED TESTING BASELINE -- NOT EXECUTED OR APPROVED FOR APPLICATION.
-- Intended testing project reference supplied by the user: wznkpgpexjexxzptuuwp.
-- That comment is NOT a technical project-identity check. Confirm the SQL Editor
-- target manually. NEVER run this on the existing development database.
-- This is a compatible reconstruction, NOT a recovered historical schema dump.
-- Reconciled with user-supplied column/constraint/index/sequence exports.
-- Current metadata does not prove pre-001 history. The user confirmed full
-- exports override the earlier summary: variants/items have NO created_at.
-- Later additions remain in 001-015. See the review report for unresolved drift.
-- See docs/INITIAL_SCHEMA_REVIEW.md before approval. Run 001-015 afterward.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

-- Fail closed on an existing/partially installed application. No IF NOT EXISTS,
-- DROP, data import, password, role creation or automatic repair is included.
DO $$
DECLARE object_name text;
BEGIN
  FOREACH object_name IN ARRAY ARRAY[
    'products','product_variants','restaurant_tables','orders','order_items','payments',
    'categories','admin_sessions','restaurant_settings','tags','product_tags',
    'product_variants_id_seq','restaurant_tables_id_seq','order_items_id_seq',
    'payments_id_seq','order_number_seq'
  ] LOOP
    IF to_regclass(format('public.%I', object_name)) IS NOT NULL THEN
      RAISE EXCEPTION 'Baseline requires a fresh application schema; existing object: %', object_name;
    END IF;
  END LOOP;
  IF to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'Review UUID function availability; no extension will be installed automatically';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'Supabase client roles are required; inspect the target before proceeding';
  END IF;
END $$;

-- Verified current column definitions, excluding fields provisioned later.
CREATE TABLE public.products (
  id varchar(100) PRIMARY KEY,
  name varchar(150) NOT NULL,
  category varchar(100) NOT NULL,
  image_url text,
  available boolean DEFAULT true,
  featured boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Verified: four bigint ID sequences are column-owned, start at 1, increment
-- by 1, and do not cycle. BIGSERIAL supplies those attributes and exact names.
-- Full exports show nextval defaults and empty identity flags (serial semantics).
CREATE TABLE public.product_variants (
  id bigserial PRIMARY KEY,
  product_id varchar(100) NOT NULL REFERENCES public.products(id)
    ON UPDATE NO ACTION ON DELETE CASCADE,
  size varchar(20) NOT NULL CHECK (size IN ('Regular', 'Large')),
  price integer NOT NULL CHECK (price >= 0),
  CONSTRAINT product_variants_product_id_size_key UNIQUE (product_id, size)
);

CREATE TABLE public.restaurant_tables (
  id bigserial PRIMARY KEY,
  table_number varchar(20) NOT NULL UNIQUE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  customer_name varchar(100) NOT NULL,
  customer_phone varchar(20),
  -- Nullable is a compatibility choice, not a claim about pre-pickup history.
  -- 002 still owns the fulfillment column and its DROP NOT NULL operation.
  table_id bigint REFERENCES public.restaurant_tables(id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  total_amount integer NOT NULL CHECK (total_amount > 0),
  -- Payment default/checks belong to 003/004/012. The current verified legacy
  -- order default is reproduced here; the backend explicitly inserts
  -- PENDING_PAYMENT for BOTH states and does not trust this default as payment.
  payment_status varchar(30) NOT NULL,
  order_status varchar(30) NOT NULL DEFAULT 'PLACED',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.order_items (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id)
    ON UPDATE NO ACTION ON DELETE CASCADE,
  product_id varchar(100) REFERENCES public.products(id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  product_name varchar(150) NOT NULL,
  -- No order-item size CHECK exists in the supplied complete constraint export.
  size varchar(20) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price integer NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE public.payments (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id)
    ON UPDATE NO ACTION ON DELETE NO ACTION,
  -- Original nullability is uncertain; 003/004 explicitly permit NULL later.
  transaction_reference varchar(100),
  payment_status varchar(30) NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT payments_order_id_key UNIQUE (order_id)
);

-- NEW bootstrap safeguards, not recovered historical definitions. Apply only
-- to the freshly created objects above; 014 later adds server-role policies.
-- Enabling RLS, leaving FORCE RLS off and creating no policies also matches the
-- supplied current six-table metadata. ACL revocations below remain deliberate
-- safeguards, NOT a claim about development grants. No custom triggers are added.
-- No policies means no client-row access. Revoke privileges too, including
-- TRUNCATE (which row policies do not govern) and sequence manipulation.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.products, public.product_variants,
  public.restaurant_tables, public.orders, public.order_items, public.payments
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.product_variants_id_seq,
  public.restaurant_tables_id_seq, public.order_items_id_seq, public.payments_id_seq
  FROM PUBLIC, anon, authenticated;
COMMIT;
