-- PROPOSAL ONLY. Target mrjsfznxbwjsdzyuzvsi, independently verified.
-- Review other consumers first: direct browser CRUD/REST/GraphQL may break.
-- Existing Express postgres owner access and service_role are retained.
-- Direct REST/GraphQL/Realtime consumers of these tables/sequences may break.
-- Apply only after approving exact sequence inventory and policy snapshot.
-- Existing policies are preserved; grants deny clients; no policies dropped.
-- This is NOT an approved change to the Razorpay testing project.
-- No rows deleted, no existing role attributes changed, no platform roles altered.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Verify every expected sequence BEFORE any REVOKE, GRANT or ALTER TABLE.
-- Missing/wrong-kind names abort the whole transaction; unrelated sequences are untouched.
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM (VALUES ('order_number_seq'),('order_items_id_seq'),
   ('payments_id_seq'),('product_variants_id_seq'),('restaurant_tables_id_seq')) expected(name)
  LEFT JOIN pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=expected.name
  WHERE c.oid IS NULL OR c.relkind<>'S'
 ) THEN RAISE EXCEPTION 'Application sequence inventory mismatch; no permission changes applied'; END IF;
END $$;
DO $$
DECLARE relation_name text; column_name text; client_role text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY['categories','products','product_variants',
 'tags','product_tags','restaurant_settings','orders','order_items','payments','admin_sessions'] LOOP
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC,anon,authenticated',relation_name);
  FOR column_name IN SELECT attname FROM pg_attribute
   WHERE attrelid=to_regclass('public.'||relation_name) AND attnum>0 AND NOT attisdropped LOOP
   EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC,anon,authenticated',column_name,relation_name);
  END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',relation_name);
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_table_privilege(client_role,'public.'||relation_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,MAINTAIN,REFERENCES,TRIGGER')
    OR has_any_column_privilege(client_role,'public.'||relation_name,'SELECT,INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION 'Inherited client grants remain; review dependencies and memberships';
   END IF;
  END LOOP;
 END LOOP;
END $$;
-- Revoke client access only to the five known application sequences; never advance/reset them.
-- Inventory precheck above guarantees these five names are sequences; no sequence reset.
DO $$ DECLARE sequence_name text; client_role text; BEGIN
 FOR sequence_name IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='S' AND c.relname IN
 ('order_number_seq','order_items_id_seq','payments_id_seq','product_variants_id_seq','restaurant_tables_id_seq') LOOP
  EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM PUBLIC,anon,authenticated',sequence_name);
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_sequence_privilege(client_role,format('public.%I',sequence_name),'SELECT,USAGE,UPDATE') THEN
    RAISE EXCEPTION 'Inherited client sequence access remains'; END IF;
  END LOOP;
 END LOOP;
END $$;
ALTER TABLE public.admin_sessions FORCE ROW LEVEL SECURITY;
-- No client policies are created. Existing inspection found none.
-- service_role and postgres retain their existing platform/owner privileges.
-- Default privileges and Storage are NOT changed: review separately.
COMMIT;
