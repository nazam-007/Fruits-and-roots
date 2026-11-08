-- PROPOSAL ONLY. Do not apply until disposable integration tests and approval.
-- Requires the approved baseline plus 001-013. Run as the migration owner.
-- No passwords, existing-role revocations, data copies or financial changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Deliberately fail if this role already exists: inspect it, do not repurpose it.
CREATE ROLE fruits_roots_backend NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
  NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE fruits_roots_backend SET search_path = pg_catalog, public;
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO fruits_roots_backend', current_database());
  IF has_schema_privilege('fruits_roots_backend', 'public', 'CREATE')
     OR has_database_privilege('fruits_roots_backend', current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'Unexpected inherited CREATE privilege; review PUBLIC grants before proceeding';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO fruits_roots_backend;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products, public.product_variants,
  public.categories, public.tags TO fruits_roots_backend;
GRANT SELECT, INSERT, DELETE ON public.product_tags TO fruits_roots_backend;
GRANT SELECT, INSERT, UPDATE ON public.orders, public.payments TO fruits_roots_backend;
GRANT SELECT, INSERT ON public.order_items TO fruits_roots_backend;
GRANT SELECT, UPDATE ON public.restaurant_settings TO fruits_roots_backend;
GRANT SELECT ON public.restaurant_tables TO fruits_roots_backend;
-- Required by the legacy checkout SELECT ... FOR KEY SHARE, not a table-management API.
GRANT UPDATE (id) ON public.restaurant_tables TO fruits_roots_backend;
GRANT SELECT, INSERT, DELETE ON public.admin_sessions TO fruits_roots_backend;
GRANT USAGE ON SEQUENCE public.order_number_seq, public.order_items_id_seq,
  public.payments_id_seq, public.product_variants_id_seq TO fruits_roots_backend;

-- The Express server is the authorization boundary. It connects as this role,
-- not as a customer JWT, and does not use auth.uid() or client-controlled claims.
-- No membership is granted to authenticator, anon, authenticated or service_role.
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'products','product_variants','categories','tags','product_tags',
    'orders','order_items','payments','restaurant_settings','restaurant_tables',
    'admin_sessions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format(
      'CREATE POLICY fr_backend_access ON public.%I FOR ALL TO fruits_roots_backend USING (true) WITH CHECK (true)',
      relation_name
    );
  END LOOP;
END $$;
-- SQL grants above still limit commands even though the role-scoped RLS policy
-- permits its rows. No ownership, TRUNCATE, REFERENCES, TRIGGER or schema CREATE.
COMMIT;
