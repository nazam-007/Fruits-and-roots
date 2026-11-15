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
