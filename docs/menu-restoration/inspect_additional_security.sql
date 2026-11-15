-- REVIEW ONLY. Do not execute until query-list approval.
-- Dedicated postgres connection, independently pinned to mrjsfznxbwjsdzyuzvsi,
-- certificate-validated TLS; same connection throughout. No application rows.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
-- Execute this first and STOP/ROLLBACK unless read_only=on and identity matches.
SELECT current_user,session_user,current_database(),
 current_setting('transaction_read_only') AS read_only;

-- Q1: Individual effective table privileges (PostgreSQL 17; includes MAINTAIN).
SELECT r.rolname,n.nspname AS schema_name,c.relname,p.privilege,
 has_table_privilege(r.oid,c.oid,p.privilege) AS granted
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
 ('MAINTAIN'),('REFERENCES'),('TRIGGER')) p(privilege)
WHERE r.rolname IN ('anon','authenticated','postgres','fruits_roots_menu_preview')
 AND n.nspname='public' AND c.relname IN ('orders','order_items','payments','admin_sessions')
 AND c.relkind IN ('r','p') ORDER BY r.rolname,c.relname,p.privilege;

-- Q2: Independent/effective column grants, including PUBLIC-derived access.
SELECT r.rolname,c.relname,a.attname,p.privilege,
 has_column_privilege(r.oid,c.oid,a.attnum,p.privilege) AS granted
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
WHERE r.rolname IN ('anon','authenticated','fruits_roots_menu_preview')
 AND n.nspname='public' AND c.relname IN ('orders','order_items','payments','admin_sessions')
 AND a.attnum>0 AND NOT a.attisdropped ORDER BY r.rolname,c.relname,a.attnum,p.privilege;

-- Q3: All public sequences: metadata/ACL only; NEVER nextval/setval/last_value.
SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl,
 r.rolname,p.privilege,has_sequence_privilege(r.oid,c.oid,p.privilege) AS granted
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
CROSS JOIN (VALUES ('SELECT'),('USAGE'),('UPDATE')) p(privilege)
WHERE n.nspname='public' AND c.relkind='S'
 AND r.rolname IN ('anon','authenticated','postgres','fruits_roots_menu_preview')
ORDER BY c.relname,r.rolname,p.privilege;

-- Q4: Existing policies, including financial tables, and RLS flags.
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner,
 p.policyname,p.permissive,p.roles,p.cmd,p.qual,p.with_check
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname=n.nspname AND p.tablename=c.relname
WHERE n.nspname='public' AND c.relname IN ('categories','products','product_variants',
 'tags','product_tags','restaurant_settings','orders','order_items','payments','admin_sessions')
ORDER BY c.relname,p.policyname;

-- Q5: PUBLIC relation ACL entries across non-system schemas. Built-in defaults included.
SELECT n.nspname,c.relname,c.relkind,a.privilege_type,a.is_grantable,
 pg_get_userbyid(a.grantor) AS grantor
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,
 acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
 AND c.relkind IN ('r','p','v','m','f','S') AND a.grantee=0
ORDER BY n.nspname,c.relname,a.privilege_type;

-- Q6: Schema/database PUBLIC defaults, plus preview role's effective privileges if it exists.
SELECT 'schema' AS kind,n.nspname AS object_name,a.privilege_type,a.is_grantable
FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
WHERE a.grantee=0 AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
UNION ALL
SELECT 'database',d.datname,a.privilege_type,a.is_grantable
FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a
WHERE d.datname=current_database() AND a.grantee=0;
SELECT r.rolname,n.nspname,has_schema_privilege(r.oid,n.oid,'USAGE') AS usage,
 has_schema_privilege(r.oid,n.oid,'CREATE') AS create_access
FROM pg_roles r CROSS JOIN pg_namespace n
WHERE r.rolname='fruits_roots_menu_preview'
 AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_';

-- Q7: Effective cross-schema table access if preview role exists (zero rows before creation).
SELECT n.nspname,c.relname,c.relkind,
 has_any_column_privilege(r.oid,c.oid,'SELECT') AS can_read,
 has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,MAINTAIN,REFERENCES,TRIGGER') AS any_table_mutation,
 has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE,REFERENCES') AS any_column_mutation
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname='fruits_roots_menu_preview' AND c.relkind IN ('r','p','v','m','f')
 AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
ORDER BY n.nspname,c.relname;
-- Q8: PUBLIC column ACLs can exist independently from relation ACLs.
SELECT n.nspname,c.relname,col.attname,a.privilege_type,a.is_grantable
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute col ON col.attrelid=c.oid
CROSS JOIN LATERAL aclexplode(col.attacl) a
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
 AND col.attnum>0 AND NOT col.attisdropped AND a.grantee=0
ORDER BY n.nspname,c.relname,col.attnum,a.privilege_type;
-- Separate snapshot_security_metadata.sql captures recovery evidence.
-- Do not interpret empty preview-role rows as verified denial: role is not created.
ROLLBACK;
