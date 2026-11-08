-- PROPOSAL ONLY. Apply only after 014 and approved dependency testing.
-- Preserves all session rows, hashes, expiry times and current backend owner access.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fruits_roots_backend') THEN
    RAISE EXCEPTION 'Apply and validate 014 first';
  END IF;
  IF pg_has_role('anon', 'fruits_roots_backend', 'MEMBER')
     OR pg_has_role('authenticated', 'fruits_roots_backend', 'MEMBER')
     OR pg_has_role('authenticator', 'fruits_roots_backend', 'MEMBER') THEN
    RAISE EXCEPTION 'Client/API roles must not be members of the backend role';
  END IF;
END $$;

REVOKE ALL PRIVILEGES ON TABLE public.admin_sessions FROM PUBLIC, anon, authenticated;
-- Table-level REVOKE does not remove independent column-level grants.
DO $$
DECLARE column_name text;
BEGIN
  FOR column_name IN
    SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.admin_sessions'::regclass AND attnum > 0 AND NOT attisdropped
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE public.admin_sessions FROM PUBLIC, anon, authenticated',
      column_name
    );
  END LOOP;
END $$;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions FORCE ROW LEVEL SECURITY;

DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(client_role, 'public.admin_sessions',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(client_role, 'public.admin_sessions',
        'SELECT,INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION 'Inherited client privileges remain; inspect role memberships';
    END IF;
  END LOOP;
END $$;
-- Changes to exposed schemas/default privileges and service-role access require
-- separate dependency review; this migration does not change Supabase platform roles.
COMMIT;
