# Final owner sign-off — preparation only — 2026-11-14

Target: mrjsfznxbwjsdzyuzvsi only. This document is not execution approval. All checkboxes remain pending owner confirmation. No database connection or SQL execution occurred in preparing this document. The retained Razorpay testing project and protected recovery snapshot were untouched.

## Confirmed evidence versus unknowns
Repository evidence: frontend customer/admin table operations use Express APIs; backend uses pg and DATABASE_URL. SSE/polling is Express-based. Storage uploads use backend service-role HTTP access; Razorpay is a separate gateway. Preview uses its own SELECT-only login and three menu tables. No production Supabase JS/PostgREST/GraphQL/Realtime consumer or repository scheduled reporting job was found. No checked-in deployment workflow establishes the actual live hosting/configuration. See EXTERNAL_DEPENDENCY_APPROVAL_PLAN.md for source locations and the consumer matrix.

Prior approved metadata inspection (not repeated here): original postgres is a non-superuser CREATEROLE/BYPASSRLS administrator; preview role is absent. Existing anon/authenticated application/sequence access is broad, with admin_sessions RLS disabled. postgres and supabase_admin public-schema default grants can expose future objects. Latest drift comparison matched all 18 metadata result sets. None of this establishes that outside clients are absent.

## Owner checklist — mark NONE / PRESENT (name and owner) / UNKNOWN
- [ ] REST/PostgREST: identify every app/script using the original project's Data API, tables, RPCs or sequences; confirm none depend on the revoked client grants, or approve their replacement first.
- [ ] GraphQL: identify external GraphQL clients, dashboards and query tools.
- [ ] Realtime: identify postgres_changes subscribers and dashboard-configured publications/consumers.
- [ ] Reporting: identify BI dashboards, spreadsheets, ETL/export/report jobs and their connection roles.
- [ ] Scheduled work: review Supabase scheduled jobs, database cron, webhooks/Edge Functions, Windows Task Scheduler, hosted CI and other automation outside this checkout. Do not change them under this approval.
- [ ] Third parties: inventory integrations, vendors, no-code tools and other devices/apps using this project. Record responsible owner and impact approval.
- [ ] Direct connections: inventory hosted/local servers, SQL tools and scripts; record role names privately (not passwords/URLs). Confirm no consumer relies on anon/authenticated or PUBLIC access to the ten tables/five sequences.
- [ ] Deployed application: confirm actual database role and which services use the original versus testing project. Repository configuration does not prove deployed configuration.
- [ ] Grant reapplication: confirm dashboard automatic new-table exposure, migration generators, restore/import workflows, role-management scripts and provider automation cannot silently reopen the protected application objects, or identify a review/monitoring plan.
- [ ] Change window: freeze concurrent DDL/grants, identify recovery operator, preserve snapshot/hash, and accept stoppage on drift or provider refusal. Avoid sharing credentials with reviewers.

UNKNOWN on a potentially affected consumer is not sign-off. Record explicit NONE where the owner has checked and found no consumer; missing code references are insufficient.

## Permission reintroduction risks
Confirmed: postgres public defaults currently grant client access; package A corrects only this creator/schema. supabase_admin public defaults remain unsafe and separately provider-authorized; A does not fix them. Built-in/global PUBLIC function EXECUTE is not overridden by schema-local revocation: new public functions need explicit ACL review in their creation transaction. New tables created by other creators, imports, backups restored with old ACLs, or later grants can reintroduce exposure.

Repository migration review: no explicit GRANT to anon/authenticated or CREATE EVENT TRIGGER/permission-restoring automation found in current backend migration source. Migration 014 grants only the backend runtime role; 015 removes session client access. Table creation in other migrations can still receive creator defaults or provider automatic grants. Do not rerun migrations for preview. Package C adds only its scoped preview grants/policies. No database event-trigger/cron inventory was established by repository search or the prior approved query scope; provider-side automation remains UNKNOWN, not absent. Dashboard automatic-exposure state in the ORIGINAL project is unconfirmed; testing-project screenshots do not establish it.

The trusted postgres administrator can alter memberships later, including granting itself preview SET/INHERIT. Narrow compatibility checks and per-read validation detect observed drift but cannot constrain a malicious database administrator permanently.

## Exact approval packages
The exact executable contents are the three named SQL source files and their matching blocks in EXACT_SECURITY_SQL_REVIEW.md. Do not execute a paraphrased summary. Recheck file SHA256 before approval/execution; a changed hash requires review.

| Package | Exact file | SHA256 |
|---|---|---|
| A | proposed_public_default_privileges.sql | 60d4fac0b1aad4f9e1b608d00627a6cd5fcc04c173c1a95c2487b702b028c6f0 |
| B | proposed_client_isolation.sql | 53b85d542a1fee5bf2a1ef5563b5dd257dcd7bb5ca08273ebca3d0ff45be7e8c |
| C | proposed_preview_role.sql | 38cdbda789d12424f3e68e610d88ad649d344b41d2a66d260a2d9e51a5c1848f |

Common prerequisites: separate execution authorization, verified original project/hostname/database/login and certificate-validated TLS; protected snapshot integrity/recovery access; matching metadata and source hashes; no concurrent security DDL. Each file has its own BEGIN/COMMIT, lock timeout 5s and statement timeout 30s. Execute complete file only; fail/ROLLBACK/close on any error. Each prior successful COMMIT remains effective if a later package fails.

### A — postgres public defaults: GO for explicit approval after owner sign-off
Changes only postgres schema-local public table/sequence/function defaults, not existing objects or Supabase platform schemas. Refuses global client table/sequence default conflicts and remaining inherited schema-local grants. Postcheck via separately approved metadata inspection: intended local grants removed; global and other-schema defaults unchanged; documented function EXECUTE limitation retained. Failure on global/inherited conflict, authority, timeout or drift requires review, not wider revocation. Before COMMIT rollback is complete. After COMMIT exact minimal restoration from private snapshot needs separate approval; never broadly restore unsafe defaults. supabase_admin correction stays excluded.

### B — client isolation: NO-GO until affected external consumers are resolved
Ten tables: categories, products, product_variants, tags, product_tags, restaurant_settings, orders, order_items, payments, admin_sessions. Five sequences: order_number_seq, order_items_id_seq, payments_id_seq, product_variants_id_seq, restaurant_tables_id_seq. restaurant_tables itself is outside the ten-table revocation scope.
Requires A verification and consumer sign-off. Removes PUBLIC/anon/authenticated table, independent column and sequence access; enables RLS on ten and FORCE RLS on sessions. No row, owner or policy deletion. Fail on five-sequence inventory mismatch, missing objects, inherited access remaining, timeout or authority mismatch. Postcheck all eight table privileges and independent column grants denied for clients, three sequence privileges denied, RLS/force flags correct, retained owner/service role access and existing policies unchanged. No live write probes. A/B record preservation does not guarantee external clients continue to work. Recovery after COMMIT requires separately approved minimal ACL/policy corrections; never reopen financial/session grants blindly.

### C — preview role: CONDITIONAL GO after B verification and explicit approval
Requires absence of preview role/five policy names, compatible provider administrator, safe PUBLIC/cross-schema capabilities and B postchecks. Creates passwordless LOGIN role with restricted attributes/defaults, CONNECT/public USAGE and SELECT on categories/products/product_variants only; five policies enforce approved 37 product IDs and exclude archived/unapproved parent variants. No passwords provisioned. Fail on role/policy collision, unexpected membership/grantor/SET/INHERIT, elevated attributes, forbidden effective reads/mutations/MAINTAIN/sequence/CREATE/definer access, or provider refusal.
Postcheck attributes, exact grants/memberships and all five policies. Actual-login checks require separate private password provisioning approval and POST_PROVISION_PREVIEW_VERIFICATION.md approval. Use menu-only SELECTs and sensitive LIMIT 0 authorization probes under READ ONLY; do not run mutation probes against original DB. If C fails before COMMIT rollback its whole transaction. After COMMIT stop deployment and prepare scoped policy/grant/role recovery with dependency review and separate approval; no DROP OWNED or data cleanup. Supabase provider behavior is not proven by vanilla PostgreSQL testing.

## Proposed owner statement — for review, NOT yet signed
“I have reviewed external consumers of mrjsfznxbwjsdzyuzvsi and recorded each as absent or resolved with its responsible owner. I understand packages A/B may break client access and future automatic grants require ongoing review. I accept the trusted database-administrator model, separate transaction/recovery limitations and stop conditions. This sign-off alone does not authorize SQL execution, password provisioning or deployment; I will approve the named packages separately.”

Owner decisions remaining: complete checklist; identify consumer/recovery owners; accept or mitigate grant reapplication risks and separate supabase_admin default limitation; approve change window and exact A/B/C hashes individually. Then separately approve credentials/actual-role verification and transport/deployment readiness. Text-only preview requires no image access, ordering, menu restoration, migration 016 or payment changes. Render preview must use start:preview, not normal npm start with expiry worker. Upstream TLS remains unresolved pending supported direct route or formal assessment.
