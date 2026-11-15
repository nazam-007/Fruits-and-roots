# PostgreSQL 17 administrative membership compatibility — 2026-11-14

Local synthetic validation only. Neither Supabase project was contacted. No application configuration, protected snapshot, credentials, financial records or running application processes were changed.

## Root cause and reviewed trust rule
PostgreSQL 17 automatically grants a newly created role to a non-superuser CREATEROLE creator, using the bootstrap superuser as grantor. The observed pg_auth_members row has roleid=the new preview role, member=postgres, grantor=10, admin_option=true, inherit_option=false and set_option=false. Superuser creation produced no such membership.

roleid is the granted role; member is the recipient; grantor records the authority issuing the grant. ADMIN allows administration/regranting, INHERIT allows automatic privilege use, and SET allows SET ROLE. MEMBER remains true even with INHERIT/SET false.

The SQL proposal and runtime metadata query permit only zero incoming rows or this exact postgres/ADMIN-only/bootstrap-superuser row. They reject every outgoing preview membership, other recipients/grantors, or operational INHERIT/SET options. Provisioning must run as the separately reviewed postgres administrator. No extra memberships are granted to make checks pass.

ADMIN is not a permanent security boundary: the creator can subsequently grant itself SET or INHERIT access. The local tests demonstrate this and demonstrate rejection by the real TypeScript privilege validator. postgres remains a trusted, powerful administrator. Runtime verification now runs at startup and before each menu read on the same leased connection. This detects observed drift, but cannot eliminate administrative authority or every concurrent metadata-change race. Strict separation from an untrusted administrator requires an independently trusted provisioning/ownership workflow and provider review, not a relaxed check.

## Files changed for compatibility
- proposed_preview_role.sql: exact creator and administrative-membership checks; all five approved-ID RLS policies retained.
- backend/src/previewPrivileges.ts: identical membership exception; all existing attribute, schema, mutation/MAINTAIN, sequence and SECURITY DEFINER checks retained.
- backend/src/startMenuPreview.ts: repeat validation before each menu read; same-client lease and finally release.
- backend/src/previewMenu.test.ts: narrow exception and per-read validation regression checks.
- backend/tests/localPreviewSqlValidation.py: actual PostgreSQL catalog, role administration, SET/INHERIT drift, unexpected membership/grantor, role flags, actual-login denial and real menu-query tests.

## Local verification
Official postgres:17 image, PostgreSQL 17.12 (Debian 17.12-1.pgdg13+1). Unique network-none containers, no host ports, tmpfs data and no persistent volumes. Exact proposal files executed only against synthetic databases. Both superuser and representative non-superuser postgres creation paths are tested. Representative flags mirror the previously inspected Supabase login, but provider hooks, platform memberships and managed restrictions are not reproduced.

22 database-free preview/security tests passed; backend TypeScript production build passed. Full disposable run results are recorded below after completion. Tests cover defaults/global guard, five-sequence inventory failures and transactional rollback, client isolation, role creation/rollback/rerun refusal, five RLS policies, archived/unapproved exclusion, sensitive-table and mutation/sequence denials, actual runtime metadata/TypeScript validator, administrator drift and exact parameterized menu SQL. The archived approved synthetic product leaves 36 visible products and 67 variants; this tests exclusion without changing the 37-ID/69-variant manifest.

## Next approval and remaining limitations
GO for separately approved, metadata-only Supabase drift verification. Verify actual endpoint/TLS/identity, postgres attributes and administrative grantor identity, memberships, effective/default ACLs, policy drift and external REST/GraphQL/Realtime dependencies. Preserve/recheck the protected snapshot using the existing recovery procedure. Do not expose snapshot contents.

NO-GO for immediate database remediation: fresh provider-specific drift verification, external consumer approval, exact SQL review and explicit execution approval remain necessary. After approved provisioning, actual preview-role menu SELECT and financial/session/sequence/mutation denials must be checked separately before deployment. Vanilla PostgreSQL success is not a Supabase compatibility claim. Pooler-to-database TLS remains unverified; no end-to-end transport claim. Supabase-managed defaults are unchanged and supabase_admin defaults remain separately unapproved.

## Completed disposable results
Superuser creation: 15 groups passed, 0 failed (fr-preview-pg17-cb8c97cf166d). Representative non-superuser CREATEROLE creation: 15 groups passed, 0 failed (fr-preview-pg17-ba6b4861b268), including actual SET ROLE denial before self-regrant and successful SET ROLE after ADMIN self-regrant, which runtime validation rejects. Both containers and synthetic data removed. An earlier representative run also passed 15/15 before the explicit SET ROLE execution assertions were added.
