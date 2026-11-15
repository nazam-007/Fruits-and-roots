-- PROPOSAL ONLY: separately approved execution in mrjsfznxbwjsdzyuzvsi only.
-- This file does not prove connection identity. Verify it independently first.
-- Prerequisite: review/execute proposed_client_isolation.sql; no public inherited
-- application access may remain. No password here: provision via psql \password.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Use the separately reviewed postgres provisioning administrator'; END IF;
END $$;
-- Fail if the role exists; never repurpose an unreviewed role.
CREATE ROLE fruits_roots_menu_preview LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
 NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD NULL;
ALTER ROLE fruits_roots_menu_preview SET default_transaction_read_only=on;
ALTER ROLE fruits_roots_menu_preview SET statement_timeout='10s';
ALTER ROLE fruits_roots_menu_preview SET search_path=pg_catalog,public;
DO $$ BEGIN
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO fruits_roots_menu_preview',current_database());
 IF has_schema_privilege('fruits_roots_menu_preview','public','CREATE')
 OR has_database_privilege('fruits_roots_menu_preview',current_database(),'CREATE') THEN
 RAISE EXCEPTION 'Unexpected inherited CREATE permission'; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO fruits_roots_menu_preview;
GRANT SELECT ON public.categories,public.products,public.product_variants TO fruits_roots_menu_preview;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY fr_menu_preview_select ON public.categories FOR SELECT TO fruits_roots_menu_preview USING (true);
-- Permissive admission plus restrictive scope: other permissive policies cannot
-- OR their way around this role's approved-product boundary.
CREATE POLICY fr_menu_preview_select ON public.products FOR SELECT TO fruits_roots_menu_preview USING (true);
CREATE POLICY fr_menu_preview_product_scope ON public.products AS RESTRICTIVE
 FOR SELECT TO fruits_roots_menu_preview
 USING (archived_at IS NULL AND id = ANY(ARRAY[
  'drink-banana',
  'drink-date',
  'drink-date-&-banana',
  'drink-mango',
  'drink-kiwi',
  'drink-dry-fruit',
  'drink-dragon',
  'drink-blueberry',
  'drink-strawberry',
  'drink-avocado',
  'drink-pineapple',
  'drink-mosambi',
  'drink-watermelon',
  'drink-beetroot',
  'drink-abc',
  'drink-grape',
  'drink-mix-fruit',
  'drink-anar',
  'drink-orange',
  'drink-apple',
  'drink-lassi',
  'drink-cold-coffee',
  'drink-persian-tea',
  'drink-turkish-tea',
  'drink-filter-coffee',
  'mix-fruit-salad',
  'exotic-fruit-salad',
  'fruit-date-delight',
  'biscoff-fruit-custard',
  'brownie-strawberry',
  'strawberry-chocolate',
  'single-choco-waffle',
  'triple-choco-waffle',
  'fruit-choco-waffle',
  'avocado-sandwich',
  'paneer-sandwich',
  'aalu-cheese-burger'
]::varchar[]));
CREATE POLICY fr_menu_preview_select ON public.product_variants FOR SELECT TO fruits_roots_menu_preview USING (true);
CREATE POLICY fr_menu_preview_variant_scope ON public.product_variants AS RESTRICTIVE
 FOR SELECT TO fruits_roots_menu_preview
 USING (EXISTS (SELECT 1 FROM public.products p
 WHERE p.id=product_id AND p.archived_at IS NULL AND p.id = ANY(ARRAY[
  'drink-banana',
  'drink-date',
  'drink-date-&-banana',
  'drink-mango',
  'drink-kiwi',
  'drink-dry-fruit',
  'drink-dragon',
  'drink-blueberry',
  'drink-strawberry',
  'drink-avocado',
  'drink-pineapple',
  'drink-mosambi',
  'drink-watermelon',
  'drink-beetroot',
  'drink-abc',
  'drink-grape',
  'drink-mix-fruit',
  'drink-anar',
  'drink-orange',
  'drink-apple',
  'drink-lassi',
  'drink-cold-coffee',
  'drink-persian-tea',
  'drink-turkish-tea',
  'drink-filter-coffee',
  'mix-fruit-salad',
  'exotic-fruit-salad',
  'fruit-date-delight',
  'biscoff-fruit-custard',
  'brownie-strawberry',
  'strawberry-chocolate',
  'single-choco-waffle',
  'triple-choco-waffle',
  'fruit-choco-waffle',
  'avocado-sandwich',
  'paneer-sandwich',
  'aalu-cheese-burger'
]::varchar[])));
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_' AND c.relkind IN ('r','p','v','m','f') AND (
 has_table_privilege('fruits_roots_menu_preview',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,MAINTAIN,REFERENCES,TRIGGER')
 OR has_any_column_privilege('fruits_roots_menu_preview',c.oid,'INSERT,UPDATE,REFERENCES')
 OR (has_schema_privilege('fruits_roots_menu_preview',n.oid,'USAGE') AND
 NOT (n.nspname='public' AND c.relname IN ('categories','products','product_variants')) AND
 has_any_column_privilege('fruits_roots_menu_preview',c.oid,'SELECT')))) THEN
 RAISE EXCEPTION 'Unexpected inherited application access; stop and review'; END IF;
END $$;
DO $$ BEGIN
 -- The reviewed administrator is postgres only. Permit zero incoming rows, or
 -- its automatic ADMIN-only grant from the bootstrap superuser (fixed PG OID 10).
 -- Every outgoing preview membership and every other incoming row is forbidden.
 -- ADMIN permits future regranting: this is trusted administration, NOT an
 -- immutable security boundary. Operational INHERIT/SET options must remain false.
 IF EXISTS (SELECT 1 FROM pg_auth_members m
 WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname='fruits_roots_menu_preview')
 OR (m.roleid=(SELECT oid FROM pg_roles WHERE rolname='fruits_roots_menu_preview') AND NOT (
 m.member=(SELECT oid FROM pg_roles WHERE rolname='postgres')
 AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
 AND m.grantor=10 AND EXISTS (SELECT 1 FROM pg_roles g WHERE g.oid=m.grantor AND g.rolsuper)
 ))) THEN
 RAISE EXCEPTION 'Unexpected preview membership or administrative grant'; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fruits_roots_menu_preview' AND
 (rolinherit OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
 RAISE EXCEPTION 'Unexpected elevated role flags'; END IF;
 IF EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog','information_schema')
 AND n.nspname !~ '^pg_' AND has_schema_privilege('fruits_roots_menu_preview',n.oid,'CREATE')) THEN
 RAISE EXCEPTION 'Unexpected cross-schema CREATE access'; END IF;
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
 AND CASE WHEN c.relkind='S' THEN has_sequence_privilege('fruits_roots_menu_preview',c.oid,'SELECT,USAGE,UPDATE') ELSE false END) THEN
 RAISE EXCEPTION 'Unexpected effective sequence access'; END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
 AND p.prokind IN ('f','p','w') AND p.prosecdef
 AND has_schema_privilege('fruits_roots_menu_preview',n.oid,'USAGE')
 AND has_function_privilege('fruits_roots_menu_preview',p.oid,'EXECUTE')) THEN
 RAISE EXCEPTION 'Reachable SECURITY DEFINER routine requires separate review'; END IF;
END $$;
-- Effective relation checks include PUBLIC-derived grants even with NOINHERIT.
-- A SELECT grant outside menu is forbidden when schema USAGE makes it reachable.
-- Inaccessible extension statistics views do NOT justify platform-grant revocation.
-- Mutation/MAINTAIN and sequence grants remain forbidden regardless of schema USAGE.
-- No additional schema USAGE is granted to make verification pass.
-- Built-in catalog helpers/ordinary platform functions and PUBLIC TEMP privileges
-- are not revoked here; metadata inspection/manual review remains required.
-- No ownership, sequences, mutations, admin sessions, settings or financial grants.
-- Product IDs are enforced by restrictive RLS AND the backend allowlist.
-- IDs generated from approved-menu.manifest.json; tests reject manifest drift.
-- Missing approved products remain absent; no product, variant or price writes.
COMMIT;
