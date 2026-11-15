-- PROPOSAL ONLY. Separate provider-supported authorization required.
-- Target mrjsfznxbwjsdzyuzvsi only, independently verified. Do NOT run as postgres
-- without demonstrated authority. No role escalation or platform membership grants.
-- Scope: future objects created by supabase_admin IN public, never platform schemas.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Requires authority to alter this creator's defaults. If denied, the ENTIRE
-- transaction must roll back. Do not grant platform-role membership to proceed.
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
 REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
 REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
 REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC,anon,authenticated;
-- Schema-local function REVOKE does not override global PUBLIC EXECUTE defaults.
-- Future public application routines need explicit per-function revocation in the
-- creation transaction. No global defaults or platform-schema defaults changed.
COMMIT;
