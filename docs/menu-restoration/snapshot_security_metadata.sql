-- REVIEW ONLY; separate metadata snapshot approval. No application records.
-- Same independently verified connection and TLS safeguards as inspection.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT current_user,session_user,current_database(),current_setting('transaction_read_only') AS read_only;
-- STOP unless expected identity and read_only=on. Save output privately with timestamp.
SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,
 c.relacl::text AS raw_acl,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname;
SELECT c.relname,a.attname,a.attacl::text AS raw_column_acl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum;
SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname;
SELECT pg_get_userbyid(d.defaclrole) AS creator_role,
 COALESCE(n.nspname,'(all schemas)') AS schema_scope,d.defaclobjtype,d.defaclacl::text AS raw_default_acl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
ORDER BY creator_role,schema_scope,d.defaclobjtype;
SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl::text AS raw_acl
FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname !~ '^pg_' ORDER BY nspname;
SELECT datname,pg_get_userbyid(datdba) AS owner,datacl::text AS raw_acl
FROM pg_database WHERE datname=current_database();
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS identity_arguments,
 pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS raw_acl,p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
ORDER BY n.nspname,p.proname,p.oid;
SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication
FROM pg_roles WHERE rolname IN ('postgres','supabase_admin','anon','authenticated',
 'authenticator','service_role','fruits_roots_menu_preview') ORDER BY rolname;
SELECT member_role.rolname AS member_role,granted_role.rolname AS granted_role,
 m.admin_option,m.inherit_option,m.set_option
FROM pg_auth_members m JOIN pg_roles member_role ON member_role.oid=m.member
JOIN pg_roles granted_role ON granted_role.oid=m.roleid ORDER BY member_role.rolname,granted_role.rolname;
ROLLBACK;
-- Snapshot is recovery evidence, not an executable rollback script. NULL ACL means
-- PostgreSQL default, not empty privileges. Preserve grantors and grant options.
