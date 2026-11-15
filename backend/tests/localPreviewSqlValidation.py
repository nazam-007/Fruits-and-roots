"""Explicitly approved local Docker validation; no env files, TCP, or shared data."""
import json
import sys
import pathlib
import re
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
NAME = 'fr-preview-pg17-' + uuid.uuid4().hex[:12]
LABEL = 'fr-preview-synthetic-validation'
results = []

def docker(*args, text=None, check=True):
    p = subprocess.run(['docker', *args], input=text, text=True, capture_output=True, timeout=90)
    if check and p.returncode:
        raise RuntimeError(p.stderr[-1200:])
    return p

def sql(text, user='postgres', check=True, database='validation'):
    return docker('exec', '-i', NAME, 'psql', '-X', '-U', user, '-d', database,
                  '-v', 'ON_ERROR_STOP=1', '-t', '-A', text=text, check=check)

def value(text, user='postgres'):
    return sql(text, user).stdout.strip()

def expect(condition, message='Assertion failed'):
    if not condition:
        raise AssertionError(message)

def refusal(text, message, user='postgres'):
    p = sql(text, user, False)
    expect(p.returncode != 0 and message in p.stderr, 'Expected refusal: ' + p.stderr[-500:])

def test(name, body):
    try:
        body()
        results.append({'test': name, 'passed': True})
        print(json.dumps(results[-1]), flush=True)
    except Exception as e:
        results.append({'test': name, 'passed': False, 'reason': str(e)})
        raise

def quoted(s):
    return "'" + s.replace("'", "''") + "'"

created = False
try:
    docker('image', 'inspect', 'postgres:17')
    docker('run', '-d', '--name', NAME, '--label', LABEL, '--network', 'none',
           '--tmpfs', '/var/lib/postgresql/data:rw', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=fr_synthetic_bootstrap', 'postgres:17')
    created = True
    info = json.loads(docker('inspect', NAME).stdout)[0]
    expect(info['HostConfig']['NetworkMode'] == 'none' and not info['HostConfig'].get('PortBindings'))
    expect(all(m['Type'] != 'volume' for m in info['Mounts']), 'Unexpected persistent volume')
    for _ in range(40):
        # Official image briefly starts a temporary init server. Wait for PID 1
        # to exec the FINAL postgres process, not just a transient ready socket.
        final_server = docker('exec', NAME, 'cat', '/proc/1/comm', check=False)
        if final_server.stdout.strip() == 'postgres' and docker('exec', NAME, 'pg_isready', '-U', 'fr_synthetic_bootstrap', check=False).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Final disposable PostgreSQL server did not become ready')
    version = sql('SHOW server_version;', user='fr_synthetic_bootstrap', database='postgres').stdout.strip()
    expect(version.startswith('17.'), 'Wrong PostgreSQL version')
    print(json.dumps({'postgresVersion': version, 'isolationVerified': True}), flush=True)
    sql('CREATE ROLE postgres LOGIN SUPERUSER; CREATE DATABASE validation OWNER postgres;', user='fr_synthetic_bootstrap', database='postgres')
    if '--membership-probe' in sys.argv:
        sql('ALTER ROLE postgres NOSUPERUSER CREATEDB CREATEROLE BYPASSRLS REPLICATION; CREATE ROLE fr_membership_probe LOGIN NOINHERIT;')
        print(value("SELECT row_to_json(m) FROM (SELECT member_role.rolname AS member,granted_role.rolname AS roleid,grantor_role.rolname AS grantor,grantor_role.oid AS grantor_oid,grantor_role.rolsuper AS grantor_superuser,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles member_role ON member_role.oid=a.member JOIN pg_roles granted_role ON granted_role.oid=a.roleid JOIN pg_roles grantor_role ON grantor_role.oid=a.grantor WHERE granted_role.rolname='fr_membership_probe') m;"), flush=True)
        raise SystemExit(0)
    sql("""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SEQUENCE order_number_seq; CREATE SEQUENCE order_items_id_seq;
CREATE SEQUENCE payments_id_seq; CREATE SEQUENCE product_variants_id_seq;
CREATE SEQUENCE restaurant_tables_id_seq;
CREATE TABLE categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,sort_order int UNIQUE);
CREATE TABLE products(id varchar(100) PRIMARY KEY,name varchar(150),category_id uuid REFERENCES categories(id),image_url text,description text,archived_at timestamptz,available boolean DEFAULT true,availability_status varchar(20) DEFAULT 'AVAILABLE');
CREATE TABLE product_variants(id bigint PRIMARY KEY DEFAULT nextval('product_variants_id_seq'),product_id varchar(100) REFERENCES products(id),size varchar(20),price int,UNIQUE(product_id,size));
CREATE TABLE tags(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text);
CREATE TABLE product_tags(product_id varchar(100) REFERENCES products(id),tag_id uuid REFERENCES tags(id),PRIMARY KEY(product_id,tag_id));
CREATE TABLE restaurant_settings(id int PRIMARY KEY,opening_hours jsonb,accepting_orders boolean);
CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE order_items(id bigint PRIMARY KEY DEFAULT nextval('order_items_id_seq'),order_id uuid REFERENCES orders(id));
CREATE TABLE payments(id bigint PRIMARY KEY DEFAULT nextval('payments_id_seq'),order_id uuid REFERENCES orders(id));
CREATE TABLE admin_sessions(token_hash char(64) PRIMARY KEY,admin_id text);
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated;
CREATE SCHEMA managed;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA managed GRANT SELECT ON TABLES TO anon;
CREATE SCHEMA extensions; CREATE VIEW extensions.pg_stat_statements AS SELECT 1 AS synthetic;
GRANT SELECT ON extensions.pg_stat_statements TO PUBLIC;
""")
    for table in ['categories', 'products', 'product_variants', 'tags', 'product_tags',
                  'restaurant_settings', 'orders', 'order_items', 'payments']:
        sql('ALTER TABLE ' + table + ' ENABLE ROW LEVEL SECURITY;')
    manifest = json.loads((ROOT / 'docs/menu-restoration/approved-menu.manifest.json').read_text())
    seed = []
    for i, c in enumerate(manifest['categories']):
        seed.append('INSERT INTO categories(name,sort_order) VALUES (' + quoted(c['name']) + ',' + str(i) + ');')
    for p in manifest['products']:
        seed.append('INSERT INTO products(id,name,category_id) SELECT ' + quoted(p['id']) + ',' + quoted(p['name']) + ',id FROM categories WHERE name=' + quoted(p['category']) + ';')
        for size, key in [('Regular', 'regular_price'), ('Large', 'large_price')]:
            if p[key] is not None:
                seed.append('INSERT INTO product_variants(product_id,size,price) VALUES (' + quoted(p['id']) + ',' + quoted(size) + ',' + str(p[key]) + ');')
    sql('\n'.join(seed))
    sql("UPDATE products SET archived_at=now() WHERE id='drink-banana'; INSERT INTO products(id,name,category_id) SELECT 'unapproved-active','Synthetic only',id FROM categories LIMIT 1; INSERT INTO product_variants(product_id,size,price) VALUES ('unapproved-active','Regular',1);")
    folder = ROOT / 'docs/menu-restoration'
    if '--representative-owner' in sys.argv:
        sql('ALTER ROLE postgres NOSUPERUSER CREATEDB CREATEROLE BYPASSRLS REPLICATION;')
        expect(value('SELECT rolsuper FROM pg_roles WHERE rolname=current_user;') == 'f')
        print(json.dumps({'inspectionOwner': 'postgres', 'superuser': False, 'createrole': True}), flush=True)
    defaults = (folder / 'proposed_public_default_privileges.sql').read_text()
    isolation = (folder / 'proposed_client_isolation.sql').read_text()
    role = (folder / 'proposed_preview_role.sql').read_text()
    managed_before = value("SELECT defaclacl::text FROM pg_default_acl WHERE defaclnamespace='managed'::regnamespace;")

    def global_defaults():
        for kind in ['TABLES', 'SEQUENCES']:
            for recipient in ['PUBLIC', 'anon', 'authenticated']:
                sql('ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT ON ' + kind + ' TO ' + recipient + ';')
                refusal(defaults, 'Global table/sequence client defaults remain')
                expect('anon=' in value("SELECT defaclacl::text FROM pg_default_acl WHERE defaclnamespace='public'::regnamespace AND defaclobjtype='r';"))
                sql('ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE SELECT ON ' + kind + ' FROM ' + recipient + ';')
    test('Global PUBLIC/direct table and sequence grants refuse and roll back', global_defaults)

    def membership():
        sql('CREATE ROLE inherited_group NOLOGIN; GRANT inherited_group TO anon WITH INHERIT FALSE, SET FALSE; ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT ON TABLES TO inherited_group;')
        expect(value("SELECT pg_has_role('anon','inherited_group','MEMBER')::text||'|'||pg_has_role('anon','inherited_group','USAGE')::text||'|'||pg_has_role('anon','inherited_group','SET')::text;") == 'true|false|false')
        refusal(defaults, 'Global table/sequence client defaults remain')
        sql('ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE SELECT ON TABLES FROM inherited_group; REVOKE inherited_group FROM anon; DROP ROLE inherited_group;')
    test('PG17 MEMBER remains true with INHERIT FALSE and SET FALSE', membership)

    def default_success():
        sql(defaults); sql(defaults)
        expect(value("SELECT defaclacl::text FROM pg_default_acl WHERE defaclnamespace='managed'::regnamespace;") == managed_before)
        sql('CREATE TABLE future_synthetic(id int); CREATE SEQUENCE future_synthetic_seq;')
        expect(value("SELECT has_table_privilege('anon','future_synthetic','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,MAINTAIN,REFERENCES,TRIGGER')::text||'|'||has_sequence_privilege('authenticated','future_synthetic_seq','SELECT,USAGE,UPDATE')::text;") == 'false|false')
    test('Local default removal is repeatable and preserves other-schema defaults', default_success)

    def inventory():
        for sequence in ['order_number_seq', 'order_items_id_seq', 'payments_id_seq', 'product_variants_id_seq', 'restaurant_tables_id_seq']:
            for wrong_kind in [False, True]:
                sql('ALTER SEQUENCE ' + sequence + ' RENAME TO saved_sequence;')
                if wrong_kind:
                    sql('CREATE TABLE ' + sequence + '(synthetic int);')
                refusal(isolation, 'Application sequence inventory mismatch')
                expect(value("SELECT has_table_privilege('anon','admin_sessions','SELECT')::text||'|'||relrowsecurity::text FROM pg_class WHERE oid='admin_sessions'::regclass;") == 'true|false')
                if wrong_kind:
                    sql('DROP TABLE ' + sequence + ';')
                sql('ALTER SEQUENCE saved_sequence RENAME TO ' + sequence + ';')
    test('Missing and wrong-kind sequences abort before ACL/RLS changes', inventory)

    def isolate():
        sql(isolation); sql(isolation)
        expect(value("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','S') AND CASE WHEN c.relkind='S' THEN has_sequence_privilege('anon',c.oid,'SELECT,USAGE,UPDATE') ELSE has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,MAINTAIN,REFERENCES,TRIGGER') END;") == '0')
        expect(value("SELECT relrowsecurity::text||'|'||relforcerowsecurity::text FROM pg_class WHERE oid='admin_sessions'::regclass;") == 'true|true')
        expect(value("SELECT has_table_privilege('service_role','payments','UPDATE');") == 't')
        expect(value("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','S') AND CASE WHEN c.relkind='S' THEN has_sequence_privilege('authenticated',c.oid,'SELECT,USAGE,UPDATE') ELSE has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,MAINTAIN,REFERENCES,TRIGGER') END;") == '0')
    test('Client/sequence revocation and session FORCE RLS; repeatable', isolate)

    def role_failure():
        sql('GRANT INSERT ON orders TO PUBLIC;')
        refusal(role, 'Unexpected inherited application access')
        expect(value("SELECT count(*) FROM pg_roles WHERE rolname='fruits_roots_menu_preview';") == '0')
        expect(value("SELECT count(*) FROM pg_policies WHERE policyname LIKE 'fr_menu_preview%';") == '0')
        sql('REVOKE INSERT ON orders FROM PUBLIC;')
    test('Preview failure rolls back role and all policies', role_failure)

    def role_success():
        sql(role)
        expect(value("SELECT rolcanlogin::text||'|'||rolinherit::text||'|'||rolsuper::text||'|'||rolbypassrls::text||'|'||rolcreatedb::text||'|'||rolcreaterole::text FROM pg_roles WHERE rolname='fruits_roots_menu_preview';") == 'true|false|false|false|false|false')
        expect(value("SELECT count(*) FROM pg_policies WHERE policyname LIKE 'fr_menu_preview%';") == '5')
        rows = json.loads(value("SELECT coalesce(json_agg(x),'[]'::json) FROM (SELECT a.admin_option,a.inherit_option,a.set_option,pg_get_userbyid(a.member) AS member,a.grantor::int AS grantor FROM pg_auth_members a WHERE a.roleid='fruits_roots_menu_preview'::regrole) x;"))
        if '--representative-owner' in sys.argv:
            expect(rows == [{'admin_option': True, 'inherit_option': False, 'set_option': False, 'member': 'postgres', 'grantor': 10}], 'Unexpected automatic creator membership')
        else:
            expect(rows == [], 'Superuser creation should not need membership')
        print(json.dumps({'automaticMembership': rows}), flush=True)
        sql("ALTER ROLE fruits_roots_menu_preview PASSWORD NULL; ALTER ROLE fruits_roots_menu_preview SET default_transaction_read_only=on;")
        refusal(role, 'already exists')
    test('Preview attributes, five policies and safe rerun refusal', role_success)
    user = 'fruits_roots_menu_preview'

    def rls():
        expect(value('SELECT current_user||\'|\'||session_user;', user) == user + '|' + user)
        expect(value('SELECT count(*) FROM products;', user) == '36')
        expect(value('SELECT count(*) FROM product_variants;', user) == '67')
        expect(value("SELECT count(*) FROM products WHERE id IN ('unapproved-active','drink-banana');", user) == '0')
        expect(value("SELECT count(*) FROM product_variants WHERE product_id IN ('unapproved-active','drink-banana');", user) == '0')
        sql('CREATE POLICY synthetic_public_read ON products FOR SELECT TO PUBLIC USING(true); CREATE POLICY synthetic_public_variant_read ON product_variants FOR SELECT TO PUBLIC USING(true);')
        expect(value('SELECT count(*) FROM products;', user) == '36')
        expect(value('SELECT count(*) FROM product_variants;', user) == '67')
    test('Actual login RLS excludes unapproved/archived despite extra permissive policies', rls)

    def denials():
        for table in ['orders', 'order_items', 'payments', 'admin_sessions']:
            refusal('SELECT 1 FROM ' + table + ' LIMIT 0;', 'permission denied', user)
        p = sql("UPDATE products SET name='forbidden';", user, False)
        expect(p.returncode != 0 and ('read-only' in p.stderr or 'permission denied' in p.stderr))
        refusal("BEGIN; SET LOCAL transaction_read_only=off; UPDATE products SET name='forbidden';", 'permission denied', user)
        p = sql("SELECT nextval('order_number_seq');", user, False)
        expect(p.returncode != 0 and ('read-only' in p.stderr or 'permission denied' in p.stderr))
    test('Sensitive reads, mutations and sequence use denied as actual login', denials)

    def runtime_metadata():
        source = (ROOT / 'backend/src/previewPrivileges.ts').read_text()
        capabilities = re.search(r'export const previewCapabilitiesSql = `([\s\S]*?)`;', source).group(1)
        relations = re.search(r'export const previewRelationsSql = `([\s\S]*?)`;', source).group(1)
        flags = json.loads(value('SELECT row_to_json(flags) FROM (' + capabilities + ') flags;', user))
        rows = json.loads(value("SELECT coalesce(json_agg(r),'[]'::json) FROM (" + relations + ') r;', user))
        role_row = json.loads(value("SELECT row_to_json(r) FROM (SELECT current_user AS name,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,current_setting('default_transaction_read_only') AS read_only FROM pg_roles WHERE rolname=current_user) r;", user))
        return role_row, rows, flags

    def runtime_assert(accepted=True):
        role_row, rows, flags = runtime_metadata()
        code = "const {assertPreviewPrivileges}=require('./src/previewPrivileges.ts');let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{try{const v=JSON.parse(s);assertPreviewPrivileges(...v);console.log('accepted')}catch{console.log('rejected');process.exitCode=1}});"
        p = subprocess.run(['node','--import','tsx','-e',code],input=json.dumps([role_row,rows,flags]),text=True,capture_output=True,cwd=ROOT/'backend',timeout=30)
        expect((p.returncode==0)==accepted, 'Actual startup validator mismatch: '+p.stdout)
        return flags

    test('Exact runtime metadata SQL and TypeScript validator accept intended role', lambda: runtime_assert())

    def unexpected_memberships():
        sql('CREATE ROLE synthetic_unexpected_member NOLOGIN; GRANT fruits_roots_menu_preview TO synthetic_unexpected_member WITH INHERIT FALSE, SET FALSE;')
        expect(runtime_assert(False)['memberships'] is True)
        sql('DROP ROLE synthetic_unexpected_member;',user='fr_synthetic_bootstrap')
        sql('CREATE ROLE synthetic_unexpected_group NOLOGIN; GRANT synthetic_unexpected_group TO fruits_roots_menu_preview WITH INHERIT FALSE, SET FALSE;')
        expect(runtime_assert(False)['memberships'] is True)
        sql('DROP ROLE synthetic_unexpected_group;',user='fr_synthetic_bootstrap')
        runtime_assert()
    test('Unexpected incoming and outgoing memberships rejected despite non-operational options', unexpected_memberships)

    def reset_admin():
        sql('REVOKE fruits_roots_menu_preview FROM postgres CASCADE;',user='fr_synthetic_bootstrap')
        if '--representative-owner' in sys.argv:
            sql('GRANT fruits_roots_menu_preview TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;',user='fr_synthetic_bootstrap')

    def administrator_drift():
        refusal('SET ROLE postgres;', 'permission denied', user)
        if '--representative-owner' in sys.argv:
            refusal('SET ROLE fruits_roots_menu_preview;', 'permission denied', 'postgres')
        for option in ['SET TRUE','INHERIT TRUE']:
            sql('GRANT fruits_roots_menu_preview TO postgres WITH '+option+';')
            expect(runtime_assert(False)['memberships'] is True)
            if option == 'SET TRUE':
                expect(value('SET ROLE fruits_roots_menu_preview; SELECT current_user;', 'postgres').splitlines()[-1] == user)
            # ADMIN permits this escalation; cleanup is fixture-only bootstrap administration.
            reset_admin()
            runtime_assert()
    test('Administrator can change operational membership; startup detects SET/INHERIT drift', administrator_drift)

    def wrong_grantor():
        sql('CREATE ROLE synthetic_unreviewed_admin LOGIN NOINHERIT; GRANT fruits_roots_menu_preview TO synthetic_unreviewed_admin WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;',user='fr_synthetic_bootstrap')
        sql('GRANT fruits_roots_menu_preview TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;',user='synthetic_unreviewed_admin')
        expect(value("SELECT count(*) FROM pg_auth_members m WHERE m.roleid='fruits_roots_menu_preview'::regrole AND m.member='postgres'::regrole AND m.grantor='synthetic_unreviewed_admin'::regrole;") == '1')
        expect(runtime_assert(False)['memberships'] is True)
        sql('REVOKE fruits_roots_menu_preview FROM synthetic_unreviewed_admin CASCADE; DROP ROLE synthetic_unreviewed_admin;',user='fr_synthetic_bootstrap')
        runtime_assert()
    test('Wrong administrative grantor rejected even with ADMIN-only options', wrong_grantor)

    def role_drift():
        for attribute in ['INHERIT','CREATEDB','CREATEROLE','BYPASSRLS','REPLICATION']:
            sql('ALTER ROLE fruits_roots_menu_preview '+attribute+';',user='fr_synthetic_bootstrap')
            runtime_assert(False)
            sql('ALTER ROLE fruits_roots_menu_preview NO'+attribute+';',user='fr_synthetic_bootstrap')
        runtime_assert()
    test('Actual startup rejects elevated role-attribute drift', role_drift)

    def real_query():
        source = (ROOT / 'backend/src/previewMenu.ts').read_text()
        query = re.search(r'export const previewMenuSql = `([\s\S]*?)`;', source).group(1)
        ids = 'ARRAY[' + ','.join(quoted(p['id']) for p in manifest['products']) + ']::varchar[]'
        cats = 'ARRAY[' + ','.join(quoted(c['name']) for c in manifest['categories']) + ']::text[]'
        output = sql('PREPARE real_menu(varchar[],text[]) AS ' + query + '; EXECUTE real_menu(' + ids + ',' + cats + ');', user).stdout
        expect('unapproved-active' not in output and 'drink-banana|' not in output and 'drink-date|' in output)
    test('Exact parameterized preview SQL works through categories and variant RLS', real_query)
    print(json.dumps({'postgresVersion': version, 'container': NAME, 'passed': len(results), 'failed': 0,
                      'network': 'none', 'hostPorts': 0, 'persistentVolumes': 0, 'results': results}, indent=2))
except Exception as error:
    print(json.dumps({'container': NAME, 'results': results, 'error': str(error)}, indent=2))
    raise
finally:
    if created:
        info = json.loads(docker('inspect', NAME).stdout)[0]
        if info['Name'] == '/' + NAME and info['Config']['Labels'].get(LABEL) == '' and info['HostConfig']['NetworkMode'] == 'none':
            docker('rm', '-f', '-v', NAME)
            print(json.dumps({'removedOwnContainer': NAME, 'testDataRemoved': True}))
        else:
            print('STOP: cleanup identity mismatch; no removal attempted')
