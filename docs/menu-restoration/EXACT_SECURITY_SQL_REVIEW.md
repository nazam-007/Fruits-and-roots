# Exact current security SQL proposals — NOT EXECUTED ON SUPABASE

See PG17_MEMBERSHIP_COMPATIBILITY.md for the reviewed PostgreSQL 17 administrative-membership exception and local results. Supabase drift verification and remediation require separate approval.

## proposed_client_isolation.sql

```sql
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

```

## proposed_preview_role.sql

```sql
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

```

## proposed_public_default_privileges.sql

```sql
-- PROPOSAL ONLY. Independently verified mrjsfznxbwjsdzyuzvsi; execution approval required.
-- Only PUBLIC SCHEMA defaults. Never auth/storage/realtime/vault/extension defaults.
-- Future objects only. Existing grants need proposed_client_isolation.sql.
-- Schema defaults are ADDITIVE to global defaults for EVERY object type.
-- Tables/sequences are protected only when no applicable global client grant exists.
-- Refuse global conflicts rather than changing defaults used by platform schemas.
-- PG17 MEMBER means direct/indirect membership regardless of INHERIT/SET options.
-- It deliberately conservatively rejects membership-derived grants even when
-- USAGE/SET are currently false. PUBLIC (OID 0) is handled separately, never passed
-- to pg_has_role. Direct client grantees are explicit; reflexive MEMBER also covers them.
-- MEMBER is not a claim that all inherited privileges are immediately usable.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_default_acl d
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='postgres')
   AND d.defaclnamespace=0 AND d.defaclobjtype IN ('r','S')
   AND CASE WHEN a.grantee=0 THEN true
    WHEN a.grantee IN ('anon'::regrole,'authenticated'::regrole) THEN true ELSE
    pg_has_role('anon',a.grantee,'MEMBER') OR pg_has_role('authenticated',a.grantee,'MEMBER') END
 ) THEN
  RAISE EXCEPTION 'Global table/sequence client defaults remain; stop for a separate design review';
 END IF;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
 REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
 REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
 REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC,anon,authenticated;
-- supabase_admin creator defaults are a SEPARATE provider-authorized proposal:
-- proposed_supabase_admin_public_defaults.sql. Never escalate to execute it.
-- IMPORTANT: schema-scoped REVOKE cannot override built-in/global PUBLIC EXECUTE
-- defaults for functions. New public routines MUST have explicit per-routine
-- REVOKE EXECUTE FROM PUBLIC,anon,authenticated in their creation transaction.
-- We deliberately do NOT issue global default revokes (would affect platform schemas).
-- Verify schema-local client additions were removed. Global FUNCTION PUBLIC
-- EXECUTE is deliberately excluded from this postcondition: it remains documented.
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_default_acl d
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='postgres')
   AND d.defaclnamespace='public'::regnamespace AND d.defaclobjtype IN ('r','S','f')
   AND CASE WHEN a.grantee=0 THEN true
    WHEN a.grantee IN ('anon'::regrole,'authenticated'::regrole) THEN true ELSE
    pg_has_role('anon',a.grantee,'MEMBER') OR pg_has_role('authenticated',a.grantee,'MEMBER') END
 ) THEN RAISE EXCEPTION 'Schema-local client default grants remain'; END IF;
END $$;
-- Tables/sequences have no built-in PUBLIC privileges; absent global ACL rows use
-- owner-only built-in defaults. Snapshot found schema-specific additions, not a
-- global table/sequence client grant. Recheck at execution; never assume unchanged.
-- Other creators, event-trigger/automatic exposure grants and later migrations can
-- still grant access. This proposal cannot prevent those; review every creation.
-- Other object creators require separate inspection/approval; no guessed roles.
COMMIT;

```
