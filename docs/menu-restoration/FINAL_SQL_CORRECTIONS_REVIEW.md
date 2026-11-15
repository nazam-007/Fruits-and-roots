# Final SQL corrections — local proposals, NOT EXECUTED

Only target mrjsfznxbwjsdzyuzvsi. No database connection or SQL execution; protected
snapshot untouched. No roles/passwords, restoration, migration 016 or deployment.

## Defaults: corrected interpretation
PostgreSQL 17 schema-specific default privileges ADD to global defaults. REVOKE
IN SCHEMA public cannot cancel global grants for tables, sequences OR functions.
The postgres proposal now checks global table/sequence ACLs first and raises if
PUBLIC/anon/authenticated or their memberships receive any grants. It never changes
global defaults or platform-schema defaults. If the check passes, its public-schema
revokes remove schema-local additions. A postcondition rejects remaining local
client additions. Tables/sequences otherwise have owner-only built-in defaults.
Previous snapshot showed public-schema entries and no global entries; this is
historical evidence, not an execution guarantee. Global checks re-run at execution.

Global PUBLIC EXECUTE for functions remains. Each future public application routine
must explicitly revoke EXECUTE from PUBLIC/anon/authenticated before its creation
transaction commits. Other creators, event-trigger automatic exposure and subsequent
GRANT statements are not prevented. The supabase_admin proposal stays separate and
unapproved; it has the same additive-default limitation, not a global override.
https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html

## RLS scope
Approved IDs come from approved-menu.manifest.json, repeated as literal SQL arrays
for products and variants; database-free tests ensure both arrays and the backend
allowlist exactly match all 37 IDs. Products must be unarchived AND approved.
Variants require an approved unarchived parent. Products/variants each get a permissive
role SELECT policy and an AS RESTRICTIVE role scope policy: the restrictive AND
boundary cannot be broadened by another permissive SELECT policy. Categories retain
their role SELECT policy. Total five policies: fr_menu_preview_select on categories,
products and product_variants, fr_menu_preview_product_scope on products, and
fr_menu_preview_variant_scope on product_variants. No functions/new tables/record
updates. Parent product policy does not reference variants: no RLS recursion.
Existing non-preview roles are not targeted by these role-specific policies.

## Safety review
Client isolation remains ten explicit application tables and five explicit sequences.
It changes no row values/sequence state, ownership or platform schemas. Dependencies
on direct anon/authenticated REST/GraphQL/Realtime clients must be approved first.
Existing postgres owner/BYPASSRLS and service_role access retained, never used by
preview. No extra schema USAGE or SECURITY DEFINER EXECUTE is granted. Mutation,
MAINTAIN, membership, sequence and reachable non-menu access guards remain intact.
All three proposals have BEGIN/COMMIT, 5s lock and 30s statement timeouts. Separate
transactions: failure in a later file does not undo earlier commits. Default/client
revokes are repeatable for reviewed objects; role/policies intentionally refuse
existing names. PostgreSQL 17 supports RESTRICTIVE policies, MAINTAIN and inspected
catalogs. Static/tests do not replace isolated SQL execution and actual-role tests.

## Approval order
Confirm protected snapshot hash and drift/change window -> separately approve
postgres-default proposal -> client isolation -> preview-role proposal -> private
password provisioning and read-only postchecks -> TLS/Render configuration review
-> explicit preview deployment approval. Stop on any guard/authority/lock failure.
Do not run any proposal from this preparation. Retain provider-owned corrections
as separately unapproved; no role escalation. Only menu GET/health preview permitted.

Local verification: 16 preview tests passed, 133 existing backend tests passed,
backend TypeScript build passed, 10 static checks passed, whitespace check passed.
No live SQL/RLS execution or existing-record access was performed.

## Final sequence/global-membership validation revision
Client isolation now verifies all five expected names exist in public with relkind S
BEFORE any REVOKE/GRANT/ALTER TABLE. Missing/wrong-kind names raise and abort. Extra
unrelated sequences remain untouched. Freeze concurrent DDL during approved execution.
The MEMBER guard was already conservative and valid: PG17 MEMBER is direct/indirect
membership independent of INHERIT/SET; USAGE and SET are narrower checks. OID-0
PUBLIC and direct anon/authenticated recipients are now explicit for review clarity.
https://www.postgresql.org/docs/17/functions-info.html

POST_PROVISION_PREVIEW_VERIFICATION.md specifies separately approved actual-role
READ ONLY menu/RLS reads, real exported menu SQL, and sensitive-table LIMIT 0 denial
probes using savepoints. No connections/provisioning now. No live write-denial tests.
Query relationship review found category join and correlated variant aggregate
compatible with the five policies; products policy does not query variants, avoiding
a circular RLS dependency. Missing approved IDs are not fabricated/restored.

Latest checks: 19 preview tests passed, 0 failed; backend build passed; 9 static
checks passed; whitespace check passed. Real PG17 execution was NOT performed:
Docker Desktop Linux engine pipe is unavailable; native installation is PG18 only.
No daemon/service/container started or runtime installed. No substitute PG18 result
is claimed. Disposable synthetic PG17 test cases are documented in the post-provision
plan; real SQL/ACL/RLS execution remains an explicit validation gap before remediation.
Protected snapshot untouched. Earlier 16-test totals are historical.
