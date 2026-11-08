-- MANUAL REVIEW ONLY. Not executed by Codex.
-- Run ONLY after separately confirming the EXISTING DEVELOPMENT project identity.
-- Metadata only: no SELECT from application records, passwords, tokens or pg_authid.
-- These describe the CURRENT database; they cannot prove pre-001 history.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';

SELECT current_database() AS database_name,
       current_setting('server_version') AS server_version,
       current_schemas(false) AS search_path_schemas;
-- A database name such as postgres is NOT a Supabase project identity check.

-- Exact types/lengths, NULL rules, defaults and identity implementation.
SELECT c.relname AS table_name, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS exact_type,
       a.attnotnull AS not_null, a.attidentity AS identity_kind,
       a.attgenerated AS generated_kind,
       pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  AND c.relname IN ('products','product_variants','restaurant_tables','orders','order_items','payments')
ORDER BY c.relname, a.attnum;

-- Column OWNED BY dependencies, distinct from a nextval default's reference.
-- User summary: four ID sequences are owned; development order_number_seq is not.
-- This reports dependency metadata, not sequence counters or application data.
SELECT s.relname AS sequence_name, d.deptype AS dependency_kind,
       tn.nspname AS owning_schema, t.relname AS owning_table, a.attname AS owning_column
FROM pg_class s
JOIN pg_namespace sn ON sn.oid = s.relnamespace
LEFT JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = s.oid
  AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a','i')
LEFT JOIN pg_class t ON t.oid = d.refobjid
LEFT JOIN pg_namespace tn ON tn.oid = t.relnamespace
LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
WHERE sn.nspname = 'public' AND s.relkind = 'S'
  AND s.relname IN ('product_variants_id_seq','restaurant_tables_id_seq',
    'order_items_id_seq','payments_id_seq','order_number_seq')
ORDER BY s.relname;

-- If enum/domain types appear, review their labels/base types rather than
-- assuming the historical status/size fields were ordinary text.
SELECT c.relname AS table_name, a.attname AS column_name, t.typtype,
       format_type(t.oid, NULL) AS type_name,
       CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype,t.typtypmod) END AS domain_base_type,
       e.enumsortorder, e.enumlabel
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
JOIN pg_type t ON t.oid = a.atttypid
LEFT JOIN pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname = 'public' AND t.typtype IN ('e','d')
  AND c.relname IN ('products','product_variants','restaurant_tables','orders','order_items','payments')
ORDER BY c.relname, a.attname, e.enumsortorder;

-- Primary/unique/check/FK definitions, including FK update/delete behavior.
SELECT c.relname AS table_name, con.conname, con.contype,
       con.condeferrable, con.condeferred, con.convalidated,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('products','product_variants','restaurant_tables','orders','order_items','payments')
ORDER BY c.relname, con.conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('products','product_variants','restaurant_tables','orders','order_items','payments')
ORDER BY tablename, indexname;

-- Associated sequence names; does NOT call nextval/setval or expose counters.
SELECT c.relname AS table_name, a.attname AS column_name,
       pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS owned_sequence
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public'
  AND c.relname IN ('products','product_variants','restaurant_tables','orders','order_items','payments')
ORDER BY c.relname, a.attnum;

SELECT sequencename, data_type, start_value, min_value, max_value, increment_by, cycle
FROM pg_sequences
WHERE schemaname = 'public'
  AND sequencename IN ('product_variants_id_seq','restaurant_tables_id_seq',
    'order_items_id_seq','payments_id_seq','order_number_seq')
ORDER BY sequencename;

-- Detect custom trigger dependencies without reading function bodies or arguments.
SELECT c.relname AS table_name, t.tgname, t.tgenabled,
       pn.nspname AS function_schema, p.proname AS function_name,
       p.prosecdef AS security_definer
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace pn ON pn.oid = p.pronamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname IN ('products','product_variants','restaurant_tables','orders','order_items','payments')
ORDER BY c.relname, t.tgname;

SELECT c.relname AS table_name, c.relkind AS relation_kind, c.relispartition,
       c.relrowsecurity AS rls,
       c.relforcerowsecurity AS force_rls, pg_get_userbyid(c.relowner) AS owner_role
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  AND c.relname IN ('products','product_variants','restaurant_tables','orders','order_items','payments')
ORDER BY c.relname;

-- Names/role/command only: review policy bodies privately if further analysis is needed.
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('products','product_variants','restaurant_tables','orders','order_items','payments')
ORDER BY tablename, policyname;
ROLLBACK;
