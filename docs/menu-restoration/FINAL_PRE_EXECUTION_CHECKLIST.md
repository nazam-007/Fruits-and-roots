# Final pre-execution readiness — NO DATABASE EXECUTION AUTHORIZED

Target only mrjsfznxbwjsdzyuzvsi. Retained testing project untouched.
Current check: Docker service stopped, Docker Desktop Linux engine unavailable,
only native PostgreSQL 18 service/binaries found. No local PostgreSQL 17 available.
No install/start/restart/container/database action performed. Do not use PG18 or
an existing development cluster as a substitute for disposable PG17 validation.

Protected recovery snapshot exists outside Windows Temp/Git; SHA-256 matched
25f97e339581db0421ac96e94eaa1e5d04d909c9e49b246b37f830f38cded1b8.
No contents displayed or snapshot changed. Existing 19 preview/security test and
backend build results are static/database-free; no real SQL ACL/RLS validation claim.

## Decision per proposal
- proposed_public_default_privileges.sql: GO for reviewed static scope; NO-GO for
  execution pending disposable PG17 test and current metadata/dependency approval.
  Only postgres/public defaults; global table/sequence conflicts must refuse, no
  override of global PUBLIC EXECUTE, no platform defaults changed.
- proposed_client_isolation.sql: GO for reviewed scope; NO-GO for execution pending
  PG17 rollback/inventory tests and external consumer sign-off. Ten explicit tables,
  five expected sequences prechecked before ACL mutations. Broad external consumer
  breakage is possible; records/owners remain unchanged.
- proposed_preview_role.sql: GO for reviewed static policy design; NO-GO for execution
  pending PG17 actual-role tests. Five policies, 37-ID restrictive guards, no writes,
  sequence access, extra schema CREATE or memberships. Refuses existing role/policies.
- proposed_supabase_admin_public_defaults.sql: separate/unapproved provider work.
  Not part of requested execution order. No role escalation.

## Dependency owners/consumers to resolve
Repository uses Express/pg for customer/admin data and backend service credentials
for Storage. Existing postgres/service_role behavior is retained. No frontend direct
Supabase table client identified. Repository analysis cannot inventory external systems.
Project owner must identify/sign off: REST/GraphQL clients, Realtime subscriptions,
SQL-editor automation/cron, reporting/ETL/export scripts and third-party dashboards
using anon/authenticated or the five sequences. Named owners are not available in
repository metadata. Confirm whether automatic new-table exposure can regrant client
permissions. Do not silently alter Storage/platform defaults. Missing dependency
owner confirmation is an unresolved change-management blocker, not proof of breakage.

## Exact future execution checklist — each item needs stated approval
1. Approve starting an already installed local Docker environment, without touching
   native development PostgreSQL. Separately approve downloading a postgres:17 image
   if absent. Then approve/execute disposable synthetic PG17 fixture validation only.
   No Supabase URLs/real records, published database access or shared volumes.
2. Verify protected snapshot integrity/readability; compare fresh approved read-only
   metadata to snapshot. Freeze concurrent DDL/grants, review exact script hashes and
   dependency sign-off. Snapshot is permission recovery evidence, not data backup.
3. Dedicated migration-owner connection: parse exact project-qualified username
   postgres.mrjsfznxbwjsdzyuzvsi, expected region session pooler host/5432/postgres.
   Reject testing project/unknown aliases/options. Validate CA/hostname and authorized
   TLS socket before SQL. current_database alone does not establish project identity.
   Local prior client-to-pooler TLS evidence is not Render/upstream encryption proof.
4. Approve/apply proposed_public_default_privileges.sql first. Inspect successful
   COMMIT and approved read-only postchecks before continuing. Stop if global grant
   guard/authority/lock/statement timeout fails; no broader default changes.
5. Approve/apply proposed_client_isolation.sql second. Five-name/kind inventory must
   pass before permissions change; missing/wrong kind aborts. Stop on unexpected
   dependencies, inherited privileges, missing tables or any SQL failure.
6. Approve/apply proposed_preview_role.sql third. Stop if role/policy names already
   exist, effective privilege checks fail or provider permissions differ. Never drop/
   repurpose an existing role or add schema access just to bypass a refusal.
7. Each file owns BEGIN/COMMIT, lock_timeout 5s and statement_timeout 30s. Execute
   fresh-session complete file with stop-on-error; attempt ROLLBACK and close on
   failure. Later failure does not reverse earlier commits. Do not auto-retry.
8. Independently check anon/authenticated have no table/column privileges on the ten
   relations, no SELECT/USAGE/UPDATE on five sequences; session RLS+FORCE true.
   Check postgres/public default ACLs without assuming global functions are private.
9. Separately approve password provisioning and POST_PROVISION_PREVIEW_VERIFICATION.md.
   Connect as ACTUAL preview login, verified TLS, BEGIN READ ONLY; verify identity/
   read_only before menu queries. Compare direct RLS and real backend query results;
   unapproved/archived products+variants invisible. Missing three products stay absent.
   Sensitive LIMIT 0 probes must return 42501, no data fetched, recover each via
   savepoint. No INSERT/DELETE/UPDATE/TRUNCATE/nextval/setval probes on original DB.
10. Verify preview role flags, memberships, schema USAGE, reachable non-menu reads,
    sequences, MAINTAIN/mutations and reachable SECURITY DEFINER with startup checks.
    Roll back/close verification transaction. Separate HTTP/Data API checks require
    approval; SQL privilege evidence alone is not proof of every API boundary.

## Recovery and Render release gates
Before commit an error aborts that transaction: ROLLBACK/close. After commit pause
rollout; use protected snapshot to prepare separately approved exact correction.
Never broadly restore unsafe financial/session client grants. No financial data
is modified by proposals; no table resets or order deletion are recovery actions.
Before Render deployment require the restricted actual-role verification, certificate-
validating reachable connection and resolved/formally assessed pooler upstream risk,
preview-only start command, HTTPS exact origin, no operational routes/expiry worker,
VITE_MENU_PREVIEW=true and matching API, protected secrets and manual deploy approval.
Text-only preview can omit Storage work. Ordering/payment launch, menu restoration,
live Razorpay and migration 016 remain separate and unauthorized.

No database connection, protected snapshot modification, application configuration,
service change, commit, push or deployment occurred in this readiness review.
