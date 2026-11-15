# Final database security remediation preparation — NOT EXECUTED

Target: mrjsfznxbwjsdzyuzvsi ONLY. Testing project wznkpgpexjexxzptuuwp untouched.
No database connection, inspection, SQL execution, configuration changes or deployment
occurred during this preparation. No actual pre-change snapshot has been captured yet.

## Files awaiting separate query-list/execution approvals
1. inspect_additional_security.sql: BEGIN READ ONLY, read-only identity check,
   15s statement timeout, Q1-Q8 metadata queries and ROLLBACK. Individual financial/
   session privileges include MAINTAIN. Sequence ACLs are metadata only; no nextval,
   setval or sequence state read. Includes policies/RLS flags, PUBLIC relation/column
   ACLs, namespace/database defaults and prospective cross-schema effective access.
2. snapshot_security_metadata.sql: separately approved read-only snapshot of public
   relation/column ACLs, policies, all default ACL metadata, non-system schema and
   function ACL metadata, database ACL and relevant role flags/memberships. No
   function source, application records or password hashes. Export results privately,
   timestamp them, record project identity, protect integrity and exclude from Git.
3. proposed_public_default_privileges.sql: schema-scoped revokes for future tables,
   sequences and functions created by postgres/supabase_admin IN SCHEMA public ONLY.
4. proposed_client_isolation.sql: ten existing application tables including financial
   tables and sessions; table+column revokes from PUBLIC/anon/authenticated, RLS enable,
   session FORCE RLS, five known application sequence revokes, inherited-access refusal.
5. proposed_preview_role.sql: new passwordless LOGIN role, three SELECT grants and
   RLS policies; refuses MAINTAIN/other writes, non-menu reads across non-system
   schemas, sequence access, cross-schema CREATE, role memberships/members and
   reachable SECURITY DEFINER routines. Effective checks include PUBLIC grants.

## Dependencies and limits
Existing repository uses Express SQL for customer/admin operations, backend service
credentials for Storage. Existing postgres/service_role grants and ownership remain.
Postgres BYPASSRLS remains functional and must NOT be used by preview. FORCE RLS does
not constrain BYPASSRLS. External REST/GraphQL/Realtime clients and scripts remain
unverified dependencies. Revoke nothing until exact inventory/policies are reviewed.
Public-schema extension-owned sequences/functions must not be modified blindly.
Only five named application sequences are proposed, not every sequence in public.
Additional objects discovered require another scope decision, not automatic cleanup.

Supabase-managed creator supabase_admin defaults IN public require suitable authority.
If permission denied, roll back whole file and obtain provider-supported remediation;
never grant platform membership/alter platform roles just to make it pass. No changes
to auth/storage/realtime/vault/extension schema defaults are proposed. Other creators
need review; this is not a blanket correction for every possible future owner.

Schema-specific function revokes DO NOT override global/built-in PUBLIC EXECUTE.
Do not claim new functions are private by default after this proposal. Each future
application routine must revoke EXECUTE FROM PUBLIC,anon,authenticated in its creation
transaction and explicitly grant approved backend access. No custom public routines
were found previously. Global default changes would affect platform schemas and are
not proposed. Ordinary platform function behavior was not source-audited; no identified
callable SECURITY DEFINER bypass is not proof of absence of all transitive effects.

Read-only session defaults can be changed by a client and do not replace grants.
Public TEMPORARY/CONNECT and PostgreSQL catalog helper execution remain; do not change
shared database privileges indiscriminately. RLS allows non-archived menu rows; the
37-ID allowlist remains enforced in the dedicated application, not the SQL role policy.
The role has SELECT on complete menu tables, including product metadata. Do not expose
its credentials to browser clients. Existing policies are preserved; newly discovered
PUBLIC/client policies or dependency risks require review before applying proposals.

## Transactional safety and recovery
All three remediation proposals use individual BEGIN/COMMIT, 5s lock and 30s statement
timeouts, and no application INSERT/UPDATE/DELETE/TRUNCATE or sequence resets. Policy/
role/grant changes are transactional; an error requires ROLLBACK on same connection.
Run in a fresh session, with offline/change-window controls and stop on first failure.
Files are independent transactions: a later failure does NOT undo an earlier COMMIT.
Default/client revokes are repeatable for the reviewed existing objects; RLS enable/
FORCE are repeatable. Role/policy creation intentionally fails if names already exist:
inspect rather than drop/repurpose/retry. Snapshot and compare drift immediately before
execution. Defaults do not retroactively remove existing grants.

Pre-change exports preserve raw ACLs/NULL defaults, grantors/grant options, policy
expressions/roles and RLS flags. They are evidence for a separately reviewed recovery
script, not automatic rollback SQL. Do not undo isolation by broadly regranting session
or financial privileges. If rollback of committed permissions is needed, stop preview,
assess affected consumers and approve exact restoration. No record recovery needed
because data is not modified, but permissions/security exposure may change immediately.

## Execution order and stop points
A. Approve/run inspection Q1-Q8 and separate snapshot queries through one dedicated,
   verified TLS postgres connection each; validate exact project and READ ONLY before
   other queries; ROLLBACK/close even on failure. No role login/password yet.
B. Review results, external dependencies, snapshot and final exact SQL revisions.
   Reconcile conflicts/extra objects before granting remediation approval.
C. Separately approve/apply public-default correction, then existing client isolation.
   Check actual results after each; do not continue after failure.
D. Separately approve/apply preview role. It starts without a password and intentionally
   refuses unexpected PUBLIC/inherited access. No membership to API/platform roles.
E. Separately approve private psql \password provisioning and read-only post-change
   metadata verification with the ACTUAL role. Test write denials only in an isolated
   fixture environment, not against original financial records.
F. Align preview startup's existing public-table checks with revised cross-schema,
   membership/function/MAINTAIN gates (not changed by this SQL-only preparation).
   Run database-free tests/builds; approve any code change separately.
G. Verify Render runtime TLS, protected secrets, API origin and preview-only startup.
   Direct verify-full route preferred; observed pooler upstream ssl=false unresolved.
   No live deployment until provider-supported encryption verified/formally assessed.
H. Explicitly approve Render configuration/deployment and non-mutating smoke checks.

## Minimum preview release gates
- Existing unsafe session and financial client grants removed and independently checked.
- Relevant sequence/default privileges reviewed; future function revocation convention.
- Dedicated role can read only menu relations, no memberships/MAINTAIN/financial reads.
- No identified callable privileged bypass; remaining platform function risk reviewed.
- Actual credential-validating TLS on chosen route and upstream risk resolved/assessed.
- Dedicated start:preview only: no normal server, expiry worker, mutation/admin/payment
  routes; VITE_MENU_PREVIEW=true and matching backend, no live/test gateway keys.
- Three missing menu items require separate restoration approval; no import included.
- Image Storage policy verification before showing images (text-only preview permitted).
- Real customer ordering remains disabled; payment/integration production blockers remain.
