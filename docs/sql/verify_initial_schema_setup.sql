-- MANUAL REVIEW ONLY. Not executed by Codex. Intended AFTER approved 000-015
-- on confirmed testing project wznkpgpexjexxzptuuwp, not the development project.
-- Metadata only. No sequence allocation, application record reads or writes.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';

-- 1. Expect 11 rows, each present=true, rls=true, backend_is_owner=false.
-- force_rls must be true for admin_sessions; false is expected for the others.
WITH required(name) AS (VALUES
  ('products'),('product_variants'),('restaurant_tables'),('orders'),('order_items'),
  ('payments'),('admin_sessions'),('categories'),('restaurant_settings'),('tags'),('product_tags')
)
SELECT r.name, c.oid IS NOT NULL AS present,
       c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
       pg_get_userbyid(c.relowner) = 'fruits_roots_backend' AS backend_is_owner
FROM required r
LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || r.name) AND c.relkind = 'r'
ORDER BY r.name;

-- 2. Expect ZERO missing columns. Presence alone is not type/default validation.
WITH required(table_name, column_names) AS (VALUES
  ('products', ARRAY['id','name','category','image_url','available','featured','created_at',
    'description','availability_status','archived_at','category_id']),
  ('product_variants', ARRAY['id','product_id','size','price']),
  ('restaurant_tables', ARRAY['id','table_number','is_active','created_at']),
  ('orders', ARRAY['id','customer_name','customer_phone','table_id','total_amount','payment_status',
    'order_status','created_at','idempotency_key','request_hash','tracking_token_hash',
    'fulfillment_type','order_number','paid_at','order_type','table_number','payment_expires_at']),
  ('order_items', ARRAY['id','order_id','product_id','product_name','size','quantity','unit_price']),
  ('payments', ARRAY['id','order_id','transaction_reference','payment_status','created_at',
    'payment_source','paid_at','verified_by','verified_at','verified_transaction_reference',
    'reconciliation_required','reconciliation_flagged_at']),
  ('admin_sessions', ARRAY['token_hash','admin_id','created_at','expires_at']),
  ('categories', ARRAY['id','name','created_at','sort_order']),
  ('restaurant_settings', ARRAY['id','accepting_orders','updated_at','opening_hours']),
  ('tags', ARRAY['id','name','created_at']),
  ('product_tags', ARRAY['product_id','tag_id'])
), expanded AS (
  SELECT table_name, unnest(column_names) AS column_name FROM required
)
SELECT e.table_name, e.column_name AS missing_column
FROM expanded e
LEFT JOIN information_schema.columns c ON c.table_schema = 'public'
  AND c.table_name = e.table_name AND c.column_name = e.column_name
WHERE c.column_name IS NULL ORDER BY e.table_name, e.column_name;

-- 3. Compare exact types, NULL rules/defaults with 000 and each later migration.
SELECT table_name, column_name, data_type, udt_name, character_maximum_length,
       is_nullable, column_default, is_identity, identity_generation
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN (
  'products','product_variants','restaurant_tables','orders','order_items','payments',
  'admin_sessions','categories','restaurant_settings','tags','product_tags')
ORDER BY table_name, ordinal_position;

-- Reconciled current exports: expect ZERO rows for these original columns AFTER
-- 000-015. Payment defaults are installed by 003/004, not pulled into 000.
-- Exact current metadata is not proof of pre-001 historical provenance.
WITH expected(table_name,column_name,type_name,max_length,nullable,default_sql) AS (VALUES
  ('products','id','varchar',100,'NO',NULL::text),
  ('products','name','varchar',150,'NO',NULL),
  ('products','category','varchar',100,'NO',NULL),
  ('products','image_url','text',NULL,'YES',NULL),
  ('products','available','bool',NULL,'YES','true'),
  ('products','featured','bool',NULL,'YES','false'),
  ('products','created_at','timestamptz',NULL,'YES','now()'),
  ('product_variants','id','int8',NULL,'NO','nextval(''product_variants_id_seq''::regclass)'),
  ('product_variants','product_id','varchar',100,'NO',NULL),
  ('product_variants','size','varchar',20,'NO',NULL),
  ('product_variants','price','int4',NULL,'NO',NULL),
  ('restaurant_tables','id','int8',NULL,'NO','nextval(''restaurant_tables_id_seq''::regclass)'),
  ('restaurant_tables','table_number','varchar',20,'NO',NULL),
  ('restaurant_tables','is_active','bool',NULL,'YES','true'),
  ('restaurant_tables','created_at','timestamptz',NULL,'YES','now()'),
  ('orders','id','uuid',NULL,'NO','gen_random_uuid()'),
  ('orders','customer_name','varchar',100,'NO',NULL),
  ('orders','customer_phone','varchar',20,'YES',NULL),
  ('orders','table_id','int8',NULL,'YES',NULL),
  ('orders','total_amount','int4',NULL,'NO',NULL),
  ('orders','payment_status','varchar',30,'NO','''PENDING_PAYMENT''::character varying'),
  ('orders','order_status','varchar',30,'NO','''PLACED''::character varying'),
  ('orders','created_at','timestamptz',NULL,'YES','now()'),
  ('order_items','id','int8',NULL,'NO','nextval(''order_items_id_seq''::regclass)'),
  ('order_items','order_id','uuid',NULL,'NO',NULL),
  ('order_items','product_id','varchar',100,'YES',NULL),
  ('order_items','product_name','varchar',150,'NO',NULL),
  ('order_items','size','varchar',20,'NO',NULL),
  ('order_items','quantity','int4',NULL,'NO',NULL),
  ('order_items','unit_price','int4',NULL,'NO',NULL),
  ('payments','id','int8',NULL,'NO','nextval(''payments_id_seq''::regclass)'),
  ('payments','order_id','uuid',NULL,'NO',NULL),
  ('payments','transaction_reference','varchar',100,'YES',NULL),
  ('payments','payment_status','varchar',30,'NO','''PENDING_PAYMENT''::character varying'),
  ('payments','created_at','timestamptz',NULL,'YES','now()')
)
SELECT e.*, c.udt_name AS actual_type, c.character_maximum_length AS actual_length,
       c.is_nullable AS actual_nullable, c.column_default AS actual_default
FROM expected e LEFT JOIN information_schema.columns c ON c.table_schema='public'
  AND c.table_name=e.table_name AND c.column_name=e.column_name
WHERE c.column_name IS NULL
   OR (e.type_name IS NOT NULL AND c.udt_name IS DISTINCT FROM e.type_name)
   OR (e.max_length IS NOT NULL AND c.character_maximum_length IS DISTINCT FROM e.max_length)
   OR (e.nullable IS NOT NULL AND c.is_nullable IS DISTINCT FROM e.nullable)
   OR replace(replace(c.column_default,'public.',''),'pg_catalog.','') IS DISTINCT FROM e.default_sql
   OR c.is_identity IS DISTINCT FROM 'NO'
   OR c.is_generated IS DISTINCT FROM 'NEVER'
ORDER BY e.table_name,e.column_name;

-- Expect zero rows: the complete exports/user clarification exclude these.
SELECT table_name,column_name AS unexpected_column FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('product_variants','order_items')
  AND column_name='created_at';

-- Expected later-field divergence: unchanged 003 creates TEXT order_number;
-- 004's ADD IF NOT EXISTS does not turn it into development's VARCHAR(30).
SELECT data_type,character_maximum_length,
       data_type='text' AS matches_unchanged_chain,
       data_type='character varying' AND character_maximum_length=30 AS matches_development
FROM information_schema.columns WHERE table_schema='public'
  AND table_name='orders' AND column_name='order_number';

-- 4. Expect five sequences: four from 000, plus order_number_seq from 003.
SELECT r.name, c.relkind = 'S' AS is_sequence
FROM (VALUES ('product_variants_id_seq'),('restaurant_tables_id_seq'),
  ('order_items_id_seq'),('payments_id_seq'),('order_number_seq')) AS r(name)
LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || r.name)
ORDER BY r.name;

-- All five: bigint, start 1, increment 1, cycle=false. No nextval/setval calls.
SELECT sequencename,data_type,start_value,min_value,max_value,increment_by,cycle,
       data_type='bigint' AND start_value=1 AND min_value=1
         AND max_value=9223372036854775807 AND increment_by=1 AND NOT cycle AS matches_sequence_summary
FROM pg_sequences WHERE schemaname='public' AND sequencename IN (
  'product_variants_id_seq','restaurant_tables_id_seq','order_items_id_seq',
  'payments_id_seq','order_number_seq') ORDER BY sequencename;

-- IMPORTANT unresolved difference: unchanged migration 003 owns order_number_seq
-- by orders.order_number; supplied development metadata says it is unowned.
-- Expect matches_unchanged_chain=true for all five, but matches_development=false
-- for order_number_seq. Do not silently detach it or mark exact parity achieved.
WITH expected(sequence_name,table_name,column_name) AS (VALUES
  ('product_variants_id_seq','product_variants','id'),
  ('restaurant_tables_id_seq','restaurant_tables','id'),
  ('order_items_id_seq','order_items','id'),
  ('payments_id_seq','payments','id'),
  ('order_number_seq','orders','order_number')
)
SELECT e.sequence_name, t.relname AS owning_table, a.attname AS owning_column,
       COALESCE(t.oid=to_regclass('public.' || e.table_name) AND a.attname=e.column_name,false) AS matches_unchanged_chain,
       CASE WHEN e.sequence_name='order_number_seq' THEN s.oid IS NOT NULL AND d.objid IS NULL
         ELSE COALESCE(t.oid=to_regclass('public.' || e.table_name) AND a.attname=e.column_name,false) END AS matches_development
FROM expected e
LEFT JOIN pg_class s ON s.oid=to_regclass('public.' || e.sequence_name) AND s.relkind='S'
LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=s.oid
  AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
LEFT JOIN pg_class t ON t.oid=d.refobjid
LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
ORDER BY e.sequence_name;

-- 5. Inspect all PRIMARY/UNIQUE/FK/CHECK definitions; validated must be true.
-- In particular: UNIQUE(payments.order_id), UNIQUE(product_variants.product_id,size),
-- the order/payment status checks from 012 and the category/tag foreign keys.
SELECT c.relname AS table_name, con.conname, con.contype,
       con.convalidated AS validated, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'products','product_variants','restaurant_tables','orders','order_items','payments',
  'admin_sessions','categories','restaurant_settings','tags','product_tags')
ORDER BY c.relname, con.conname;

-- Current original FK deletion rules: expect five rows with matches_delete_rule=true.
WITH expected(table_name,column_name,parent_table,delete_code) AS (VALUES
  ('product_variants','product_id','products','c'),
  ('order_items','order_id','orders','c'),
  ('order_items','product_id','products','a'),
  ('orders','table_id','restaurant_tables','a'),
  ('payments','order_id','orders','a')
)
SELECT e.*, con.conname, con.confdeltype::text AS actual_delete_code,
       con.confupdtype::text AS actual_update_code,
       COALESCE(con.confdeltype::text=e.delete_code AND
         con.confrelid=to_regclass('public.' || e.parent_table) AND con.confupdtype::text='a'
         AND NOT con.condeferrable AND NOT con.condeferred AND con.convalidated,false) AS matches_delete_rule
FROM expected e
LEFT JOIN pg_class t ON t.oid=to_regclass('public.' || e.table_name)
LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attname=e.column_name AND NOT a.attisdropped
LEFT JOIN pg_constraint con ON con.conrelid=t.oid AND con.contype='f' AND con.conkey=ARRAY[a.attnum]
ORDER BY e.table_name,e.column_name;

-- Expect zero rows: unlike product_variants, order_items has no size CHECK in
-- the complete export. Do not silently invent one from frontend validation.
SELECT conname FROM pg_constraint WHERE conrelid=to_regclass('public.order_items')
  AND conname='order_items_size_check';

-- Expect zero custom triggers on the six original tables.
SELECT c.relname,t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace
  AND c.relname IN ('products','product_variants','restaurant_tables','orders','order_items','payments');

-- 6. Review indexes, especially unique idempotency/order number/verified reference.
SELECT t.relname AS table_name, i.relname AS index_name,
       x.indisunique, x.indisvalid, x.indisready, pg_get_indexdef(i.oid) AS definition
FROM pg_index x
JOIN pg_class i ON i.oid = x.indexrelid
JOIN pg_class t ON t.oid = x.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
ORDER BY t.relname, i.relname;

-- 7. Expect a role-scoped fr_backend_access policy on each of the 11 tables.
-- The policy must NOT be broadened to PUBLIC/anon/authenticated.
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 8. Role must exist; elevated flags and inheritance false.
-- canlogin=false immediately after 014; separate approved provisioning changes it.
SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolbypassrls,
       rolcreatedb, rolcreaterole, rolreplication
FROM pg_roles WHERE rolname = 'fruits_roots_backend';

-- 9. Expect every granted=true. UPDATE(id) on restaurant_tables is column-scoped.
WITH required(table_name, privilege_names) AS (VALUES
  ('products',ARRAY['SELECT','INSERT','UPDATE','DELETE']),
  ('product_variants',ARRAY['SELECT','INSERT','UPDATE','DELETE']),
  ('categories',ARRAY['SELECT','INSERT','UPDATE','DELETE']),
  ('tags',ARRAY['SELECT','INSERT','UPDATE','DELETE']),
  ('product_tags',ARRAY['SELECT','INSERT','DELETE']),
  ('orders',ARRAY['SELECT','INSERT','UPDATE']),
  ('payments',ARRAY['SELECT','INSERT','UPDATE']),
  ('order_items',ARRAY['SELECT','INSERT']),
  ('restaurant_settings',ARRAY['SELECT','UPDATE']),
  ('restaurant_tables',ARRAY['SELECT']),
  ('admin_sessions',ARRAY['SELECT','INSERT','DELETE'])
)
SELECT r.table_name, p.privilege,
       has_table_privilege('fruits_roots_backend','public.' || r.table_name,p.privilege) AS granted
FROM required r CROSS JOIN LATERAL unnest(r.privilege_names) AS p(privilege)
ORDER BY r.table_name,p.privilege;
SELECT has_column_privilege('fruits_roots_backend','public.restaurant_tables','id','UPDATE') AS table_lock_grant;

SELECT name, has_sequence_privilege('fruits_roots_backend','public.' || name,'USAGE') AS usage_granted
FROM (VALUES ('product_variants_id_seq'),('order_items_id_seq'),
  ('payments_id_seq'),('order_number_seq')) AS required(name);

-- 10. Expect ALL allowed=false and any_column_access=false for client sessions.
SELECT r.role_name, p.privilege,
       has_table_privilege(r.role_name,'public.admin_sessions',p.privilege) AS allowed
FROM (VALUES ('anon'),('authenticated')) AS r(role_name)
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
  ('REFERENCES'),('TRIGGER')) AS p(privilege);
SELECT role_name, has_any_column_privilege(role_name,'public.admin_sessions',
  'SELECT,INSERT,UPDATE,REFERENCES') AS any_column_access
FROM (VALUES ('anon'),('authenticated')) AS r(role_name);
SELECT role_name, pg_has_role(role_name,'fruits_roots_backend','MEMBER') AS backend_membership
FROM (VALUES ('anon'),('authenticated'),('authenticator')) AS r(role_name);

-- 11. Expect false for these forbidden runtime privileges.
SELECT has_schema_privilege('fruits_roots_backend','public','CREATE') AS schema_create,
       has_database_privilege('fruits_roots_backend',current_database(),'CREATE') AS database_create,
       has_table_privilege('fruits_roots_backend','public.orders','DELETE') AS order_delete,
       has_table_privilege('fruits_roots_backend','public.payments','DELETE') AS payment_delete,
       has_table_privilege('fruits_roots_backend','public.admin_sessions','UPDATE') AS session_update,
       has_table_privilege('fruits_roots_backend','public.admin_sessions','TRUNCATE') AS session_truncate;
ROLLBACK;
