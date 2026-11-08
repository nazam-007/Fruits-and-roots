# Phase 2 — database security proposal (8 November 2026)

**Status: ON HOLD. Approval required before any database security changes.**

AGENTS.md and the Phase 1 report were read first. Starting branch: `fix/phase1-production-readiness`; starting working tree: clean. Phase 1 files are already part of this checkout and were preserved. No migrations, permission changes, credential rotation, shared writes, Git history actions or deployment were performed in Phase 2. Live investigation was restricted to metadata, aggregate session dependency counts and the Data API's OpenAPI schema; no session tokens/hashes/customer records were retrieved. An aggregate count is a snapshot, not a reason to invalidate sessions.

## 1. Findings and root causes

| Finding | Evidence and root cause |
| --- | --- |
| Critical: client access to admin sessions | OpenAPI returned HTTP 200 and advertised `/admin_sessions`. PostgreSQL metadata confirms RLS=false, FORCE RLS=false, no policies and broad direct anon/authenticated grants including SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER. Migration 005 creates the table without revoking automatic public-schema grants or enabling RLS. Both database privilege and row-policy layers were missing. No exploit/write probe was run. |
| High: unverified/plain database transport | Existing db.ts passed only connectionString and a timeout; the Phase 1 application socket and pg_stat_ssl reported no encryption. There was no production TLS requirement or CA configuration. A connection URL alone is not evidence of certificate validation. |
| High: owner-like runtime role | The configured role is the table-owning `postgres` role, with BYPASSRLS, CREATEDB and CREATEROLE (not superuser). It combines migration/owner authority with application traffic. RLS cannot constrain a BYPASSRLS role. |

Supabase documents automatic public-schema grants as a source of unintended Data API exposure; grants and RLS must be reviewed together. See [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).

### Session dependencies

- One session existed and was active at inspection. Migration proposals preserve every session row, expiry and hash.
- Login validates environment-based username and scrypt hash, deletes expired sessions, inserts a SHA-256 token hash with eight-hour expiry and returns the token only in an HttpOnly cookie.
- Validation selects admin_id by token hash and unexpired time; logout deletes that token's row. The backend does **not** need UPDATE, TRUNCATE, sequence, trigger or DDL privileges on admin_sessions.
- Backend queries use direct pg connections, not Supabase Auth or browser JWTs. Cookie protections, origin checks and Express authorization remain unchanged. No other application code depends on session-table Data API access. Unknown external integrations still require owner review.
- Existing `postgres`/service-role access is not removed by these proposals. The old backend connection can continue during a controlled rollout; the new backend role receives explicit SELECT/INSERT/DELETE plus an RLS policy before the client isolation step. No forced logout is part of the migration. Existing potentially exposed sessions may warrant separately authorized incident response; no invalidation or credential rotation was performed here.

## 2. Proposed migrations — files prepared, NOT executed

1. [014_backend_runtime_role.sql](../backend/migrations/014_backend_runtime_role.sql): creates a new NOLOGIN/NOINHERIT/NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOREPLICATION role; sets a safe search_path; grants explicit CONNECT/schema usage, table/column privileges and four required sequences; enables RLS and creates a policy limited to this server role. It deliberately fails if the role/policy already exists rather than repurposing it. Unexpected inherited schema/database CREATE privilege aborts the transaction for review.
2. [015_admin_sessions_client_isolation.sql](../backend/migrations/015_admin_sessions_client_isolation.sql): requires 014, rejects client/authenticator membership in the backend role, revokes **table and independent column privileges** from PUBLIC/anon/authenticated, enables and forces session RLS, and asserts that no inherited client privileges remain. No session records are deleted. Lock/statement timeouts bound the migration; any error rolls back that migration.

These are transactional migration proposals, not a deployment script. They contain no passwords or data migrations. They have been reviewed as source but have **not been executed or validated by a PostgreSQL migration run**. Execute only after explicit approval, first in a disposable database. Do not blindly re-run partially applied history. Owner/superuser permissions to create the role/policies and grant privileges must be verified in the disposable Supabase project.

### Permission map and RLS architecture

| Object | New backend privileges | Dependency |
| --- | --- | --- |
| products, product_variants, categories, tags | SELECT/INSERT/UPDATE/DELETE | Admin catalog changes, availability and price locks; category table locking during sort/create |
| product_tags | SELECT/INSERT/DELETE | Assign/unassign and tag-delete cascade |
| orders, payments | SELECT/INSERT/UPDATE | Checkout, expiry, verification, tracking and lifecycle; no financial-record deletion |
| order_items | SELECT/INSERT | Checkout snapshots and admin/customer details; no update/delete |
| restaurant_settings | SELECT/UPDATE | Opening hours/manual pause; singleton must already be provisioned |
| restaurant_tables | SELECT and UPDATE(id) only | Legacy SELECT FOR KEY SHARE needs UPDATE on at least one column |
| admin_sessions | SELECT/INSERT/DELETE | Login, validation, expired-session cleanup/logout |
| order_number_seq, order_items_id_seq, payments_id_seq, product_variants_id_seq | USAGE only | nextval/default-generated IDs; no setval privileges |

The legacy row-lock grant is required by PostgreSQL's [SELECT locking rules](https://www.postgresql.org/docs/14/sql-select.html); removing it without a route change can break checkout. UUID IDs use the existing UUID function, not sequences. No schema ownership, schema CREATE, table TRUNCATE, REFERENCES, TRIGGER or platform auth/storage grants are added. Effective PUBLIC grants are inherited by every role and cannot be denied on just one role; review unexpected PUBLIC privileges rather than assuming NOINHERIT removes them. RLS policy conflicts or restrictive policies on an existing target can also block the runtime role and must be tested.

The RLS policy is role-scoped `USING (true) WITH CHECK (true)`, because this trusted backend serves all customers/admins over one database pool. SQL command grants still constrain operations. End-user authorization stays in Express and tracking-token checks; auth.uid() would be NULL on these direct connections and would break existing functionality. Never grant this role to anon, authenticated, authenticator, service_role or another client-accessible role; NOINHERIT does not itself prevent SET ROLE through membership. The role owns no tables and does not bypass RLS.

Supabase service_role remains a privileged **server** capability used for Storage; it is not a public client role. This proposal does not revoke platform dependencies or claim to protect against a leaked service key. Further reduction of its session-table privileges must follow dependency testing. Do not expose it in the browser.

## 3. Prepared backend TLS/configuration changes

[databaseConfig.ts](../backend/src/databaseConfig.ts) now builds the pg Pool options used by [db.ts](../backend/src/db.ts).

- Production defaults to verify-full behavior: encrypted transport, rejectUnauthorized=true, TLS 1.2 minimum, normal Node certificate/hostname validation. Node's configured trust roots are used unless DATABASE_CA_CERT_PATH supplies the project's trusted CA PEM.
- Production rejects disable/require/prefer/no-verify modes, globally disabled certificate verification and **all URL query parameters**. This prevents pg URL parsing from overwriting explicit TLS options or connection identity. Use a query-free PostgreSQL URL and separate environment settings. CA read errors are sanitized.
- Development retains the current plaintext default unless verify-full is explicitly selected. This does not fix the existing shared connection until approved configuration/certificate changes are provisioned. No `.env` or credentials were changed.
- `.env.example` documents DATABASE_TLS_MODE and DATABASE_CA_CERT_PATH. Its disable example is development-only and must not be copied unchanged into production.

This follows the driver's warning about SSL URL options replacing explicit SSL settings: [node-postgres SSL](https://node-postgres.com/features/ssl). No rejectUnauthorized=false, custom hostname-verification bypass or connection fallback is added.

### Supported Supabase connection method

Prefer the **direct** endpoint copied from the new project's Connect panel for this persistent Express server. With an IPv4-only host, use the supported **session pooler** endpoint from that panel instead; do not invent hostnames or use transaction pooling without separate testing. A custom-role direct login uses `fruits_roots_backend`; a shared session-pooler login uses `fruits_roots_backend.<project-ref>`. The pg driver still authenticates the underlying custom database role. See [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres).

Mount the trusted certificate downloaded from the **target** project's Database settings and set DATABASE_CA_CERT_PATH when required by its issuer. Use the endpoint DNS hostname matching the certificate. Configure provider-side SSL enforcement only after inventorying all clients and confirming they support verified TLS; no provider setting was changed here.

### Verify the actual application connection after approval

From backend, with the intended production role, query-free URL, NODE_ENV=production, DATABASE_TLS_MODE=verify-full and trusted CA configured, run `npm run db:verify`. It imports the **same db pool/config** as API routes, leases one client, inspects its actual TLS socket and runs metadata SQL inside a read-only transaction. It prints only transport flags/protocol and role flags, then exits nonzero unless the client is encrypted, certificate-authorized, the intended role is active and elevated flags are absent. It never prints connection strings or credentials.

The query to pg_stat_ssl describes the database-facing hop. A pooler can terminate TLS before that hop, so a false upstream flag alone does not contradict a verified client-to-pooler TLS socket. For full client-to-Postgres TLS evidence, use the direct endpoint; for a pooler, additionally confirm provider-side hop guarantees/enforcement. No claim is made that configuring CA options proves a successful handshake.

Required negative tests in the disposable environment: wrong CA, wrong hostname and non-TLS server must fail; reconnects must not fall back to plaintext. The checker has not been run with the proposed production role because that role/certificate configuration has not been provisioned.

## 4. Potential breaking changes and rollout gates

- Existing production URLs with sslmode/sslrootcert or other query options will now fail startup until moved to explicit configuration. Missing/untrusted CA files and wrong endpoint certificates fail closed.
- Public clients relying on session-table Data API access will stop working; no legitimate dependency was found in this repo. Removing table grants alone would leave column grants/inherited grants; 015 handles/checks these.
- Enabling RLS without the new role policy would break runtime access. Apply/review 014 before 015, then test login, checkout locks, expiration, verification and CRUD as the new role—not the owner. Existing restrictive policies, schema ownership/default grant drift and different sequence names require review.
- Role/password provisioning is separate: after approval, use an interactive secure admin session to set a fresh password (`\password fruits_roots_backend` in psql) and enable LOGIN. Never put passwords in migrations, command-line arguments, source control or this report. This provisions a new role; it does not rotate the existing role's credentials.
- Do not switch backend credentials or revoke the old role's authority until the new role has passed the integration suite through the chosen Supabase endpoint. Keep application deployment and schema application separately approved. No frontend authentication redesign is needed.

## 5. Prepared isolated integration tests and results

[database.integration.test.ts](../backend/tests/database.integration.test.ts) exercises real Express routes and real database queries, with no mocked DB, after preflight gates. It never applies migrations or provisions/deletes a database. [integrationTarget.ts](../backend/tests/support/integrationTarget.ts) rejects shared targets (including direct/pooler project aliases), mismatched inspector endpoints, URL options, unexpected hosts/names and incomplete opt-in.

Required preparation, **not performed**:

1. Provision a disposable TLS-enabled local database named fruits_roots_test_<run>, or a separate disposable Supabase project via its direct endpoint. Match the intended PostgreSQL version. Do not import customer/demo orders or sessions.
2. With approval, install the approved baseline/history through 015 and provision the backend role/password. The repo's original migrations do not bootstrap core tables from an empty database; obtain a reviewed schema-only pre-001 baseline or an approved current-schema snapshot. Never replay 001–013 blindly onto a current snapshot.
3. In the disposable database only, create a test marker schema/table before any runner is enabled:

   ```sql
   -- PROPOSED TEST SETUP ONLY; not a production migration; not executed here.
   CREATE SCHEMA fr_test_control;
   CREATE TABLE fr_test_control.marker (
     run_id uuid PRIMARY KEY,
     disposable boolean NOT NULL CHECK (disposable)
   );
   -- Insert the chosen INTEGRATION_RUN_ID once via the approved setup process.
   -- No backend grant is needed: the isolated inspector verifies the marker.
   ```

4. Supply INTEGRATION_DATABASE_URL for the non-owner backend role, INTEGRATION_INSPECTOR_DATABASE_URL for an isolated owner permitted to SET LOCAL ROLE anon/authenticated, INTEGRATION_EXPECTED_HOST, INTEGRATION_EXPECTED_DATABASE, INTEGRATION_RUN_ID (UUID), INTEGRATION_ALLOW_WRITES=I_ACKNOWLEDGE_DISPOSABLE_ONLY, and DATABASE_CA_CERT_PATH when needed. Both URLs must identify exactly the same disposable endpoint/database. The local backend/.env is read **only to exclude its shared identity**, never as a target fallback; CI without that file must supply SHARED_DATABASE_URL for exclusion. Keep all values in a temporary untracked secret store. The runner deliberately does not support a remote pooler endpoint; validate the selected production pooler separately after the direct test suite.
5. Ensure the singleton restaurant_settings row exists from approved migrations. No owner connection is used by API routes. Run `npm run test:integration` serially; retain the disposable database and sanitized test artifacts on failure. Delete the project/database only in a separately authorized cleanup that repeats target checks.

Prepared real-DB coverage: admin login/session/logout, public-role SQL session access denial, runtime role privileges, category/tag/product create/edit/delete/archive, public menu, opening/closed/paused schedules, server pricing despite tampered client totals, checkout pending isolation, pending cancellation, legacy registered-table checkout row locking, manual claim without self-confirmation, simultaneous same-order verification, different-reference conflicts, simultaneous cross-order duplicate reference, expiration/late reconciliation, New Orders visibility, tracking token rejection/SSE and PREPARING→READY→COMPLETED.

The tests use synthetic client IPs behind an explicitly trusted loopback ingress so normal multi-customer scenarios do not hit one shared IP's rate budget. Production rate limits are unchanged. An inspector is used for preflight, a synthetic registered-table fixture and rolled-back client-role denial probes; API operations use the least-privilege role. No cleanup truncation is built into the runner. A failed authorization assertion cannot commit an inserted test session because its probe is rolled back in finally.

Additional release tests: anonymous/authenticated **Data API HTTP** denial using the disposable project's real client credentials, forged/expired session rejection, grants/policy inheritance and column-grant regression, verification-versus-expiry/cancellation races, legacy table checkout row locking, dashboard zero/production demo isolation, wrong-CA/hostname refusal, real Storage upload permissions and real browser cart/checkout/tracking against this database. The Phase 1 mocked browser suite is not a substitute. The prepared suite's scenarios do not claim full race/performance or real bank verification coverage.

Results for this phase:

| Check | Result |
| --- | --- |
| npm test | **55 passed, 0 failed, 0 skipped** (includes TLS configuration and target-isolation regressions) |
| npm run build | Passed |
| Integration suite standalone strict TypeScript check | Passed (tsc --noEmit with strict/Node16 resolution) |
| npm run test:integration without disposable configuration | **0 passed, 0 failed, 1 skipped**; safe default, no DB connection |
| SQL migrations / real database integration | **Not executed**: explicit approval and provisioned disposable target required |
| Maintained desktop smoke subset: checkout form, admin login, tracking authorization | **3 passed, 0 failed** against the isolated read-only contract harness |

Frontend code is unchanged; Phase 1's 104 passed/16 skipped Playwright results are historical, not a new real-database integration result. No TLS handshake or SQL migration success is inferred from unit tests.

## 6. Separate production Supabase project: manual steps

1. Create a dedicated production project with approved region, access controls, backup/retention requirements and operational ownership. Keep development projects, keys and database URLs separate. Restrict network access to the intended backend and administrative access paths.
2. Inventory integrations using public Data API/GraphQL. This application uses Express REST and direct pg, plus Supabase Storage HTTP. Prefer disabling unused Data API or removing public from exposed schemas in the new project after testing Storage/platform dependencies. This is a dashboard change requiring approval, not something either migration performs. Disable automatically exposing new tables and review owner-specific default privileges. Explicitly review future functions, grants and column privileges rather than relying on a dashboard toggle alone.
3. Bootstrap the **approved pre-001 baseline**, then apply reviewed migrations in this order through a checksummed migration ledger:
   - 001_order_idempotency_tracking.sql
   - 002_counter_pickup_orders.sql
   - 003_demo_payments_and_order_numbers.sql
   - 004_order_creation_schema_repair.sql
   - 005_admin_dashboard.sql
   - 006_menu_management.sql
   - 007_order_fulfillment_choice.sql
   - 008_dynamic_categories.sql
   - 009_category_sort_order.sql
   - 010_restaurant_ordering_settings.sql
   - 011_restaurant_weekly_opening_hours.sql
   - 012_payment_attempt_lifecycle.sql
   - 013_product_tags.sql
   - 014_backend_runtime_role.sql (proposal)
   - 015_admin_sessions_client_isolation.sql (proposal)

   Alternatively restore a reviewed **current schema-only snapshot** and apply only truly outstanding migrations. Verify all constraints/indexes/sequences against a manifest; the missing legacy fulfillment constraint and duplicate indexes noted in Phase 1 are drift to resolve explicitly, not a reason to rerun history. Schema import/DDL is not authorized by this report.
4. Keep ordering manually paused until readiness and staff receipt checks are approved. Migrations 010/011 default to accepting/all-day opening, so deliberately configure reviewed hours/closed days and accepting_orders=false during approved provisioning before exposing traffic. NODE_ENV=production, DEMO_PAYMENTS_ENABLED=false, exact HTTPS origin/API URL, trusted proxies and one persistent backend process remain required.
5. Migrate **only approved catalog data**: categories/sort order, products/descriptions/prices/variants/availability/featured flags, tags and associations. Preserve stable IDs where practical and validate positive Regular prices, uniqueness and foreign keys. Export/import only an explicit whitelist; no full data dump, orders, order_items, payments, admin_sessions or test markers. Use a reviewed one-time catalog import with checksums/counts and a dry-run comparison in staging. Do not run the development seedMenu script against production.
6. Create a fresh menu-images bucket with reviewed public-read rules, backend-only writes, JPEG/PNG/WebP and 4 MB limits. Copy only approved image objects, verify their integrity/content types, then update new-project catalog URLs through the approved import. Leave old objects untouched. Inventory external image URLs and fallback behavior. Keep the new service-role key backend-only. Validate Storage policies using client credentials in disposable Supabase first.
7. Provision a unique backend database role/login through the secure process above, then set secret-manager configuration and verify the real application connection. Admin accounts are **environment username+scrypt hash**, not Supabase Auth users or a copied admin table. Generate a new strong admin password/hash interactively; never copy development sessions. Provision a stable new tracking secret (there are no historical production tracking tokens to preserve in a new project).
8. Review effective grants, policies and memberships as each role. Verify no client role can read/forge sessions or alter payments/orders, no client can assume the backend role, and the runtime role does not own tables. Review privileges inherited through PUBLIC and defaults for every object-creating owner. Preserve migration-owner access for recovery; do not revoke platform roles speculatively.
9. Enable and verify plan-appropriate backups/PITR, retention, restore ownership and alerts; separately back up approved Storage objects and bucket/policy configuration. Practice a restore into another isolated project before launch. Never assume a database snapshot contains image object bytes. Define acceptable data loss/recovery time and staff reconciliation procedures.

## 7. Rollback and preservation

- Before an approved migration: record grants (including column/default grants), policies, RLS/FORCE flags, role memberships, object owners, current application config version, session count and backup/restore identifiers securely. Do not export session secrets into reports.
- Both proposals use BEGIN/COMMIT. On a failed statement, abort/ROLLBACK that migration; do not continue executing later statements or delete history entries. If 014 commits but 015 fails, the new role remains NOLOGIN unless separately provisioned, and the old backend continues to work. The client exposure still needs remediation.
- After a credential cutover problem, pause ordering and roll back the backend's secret/config reference to the previously approved connection **only with incident approval**; keep verified TLS and the new session client restrictions enabled. The old BYPASSRLS role is a temporary recovery path, not an acceptable permanent production role. No automatic privilege revocation of it occurs in this phase.
- Do **not** roll back by disabling RLS, granting anon access again, using rejectUnauthorized=false or deleting sessions/payments. The schema/data shape is unchanged, so retain the hardening while diagnosing a missing narrow grant or certificate setting.
- If retiring the unused new role is approved, first stop new connections, remove only its named policies/grants, confirm no sessions/ownership dependencies and then retire it in a separate reviewed change. Do not use DROP OWNED/CASCADE: that can destroy unrelated objects. No blanket executable down-migration is included because it would recreate the vulnerability or assume unknown dependency state.
- New-project launch rollback: before real orders, retain the old deployment/project unchanged and revert the unpublished configuration. After real orders, pause traffic, preserve the new project's orders/payments/receipts and reconcile operationally; never overwrite it with development data or silently point active tracking tokens at another database. Restore to a separate project first, verify and explicitly approve any cutover.

## 8. Remaining blockers and approval boundary

The live findings remain unresolved until approved changes are applied and tested. Required gates: approved baseline and migration history, disposable environment, SQL execution/permission tests, real client Data API denial, verified TLS through chosen endpoint, new-role CRUD/checkout/session compatibility, receipt-verification operating procedure, complete financial race tests, Storage and recovery validation, production hosting/configuration and explicit deployment authorization. Manual UPI verification still cannot prove bank receipt from a typed reference; staff must independently verify recipient, amount, reference and final receipt. No Razorpay integration is included.

Approval requested **only after reviewing these files**: provision the disposable environment and apply 014/015 there first, with narrowly scoped test-role/password/marker setup. Shared Supabase permissions, credentials and production deployment remain untouched and require their own subsequent approval. This follows the user's explicit instruction to stop before applying database security changes.

## 9. Files and Git status

Prepared changes: README.md, backend/.env.example, backend/package.json, backend/src/db.ts; new 014/015 migrations, databaseConfig.ts/.test.ts, verifyDatabaseConnection.ts, database.integration.test.ts, integrationTarget.test.ts, tests/support/integrationTarget.ts, and this report. No dependencies/lockfiles, frontend files, existing migration files, historical reports, financial records or credentials were changed.

Final Git verification: branch `fix/phase1-production-readiness`; four tracked files modified and nine new files (13 total). `git diff --check` passed; no unmerged paths or conflict markers were found. `git diff --stat` reports four tracked files, 15 insertions and six deletions; untracked new files are excluded from that statistic. All changes remain uncommitted. No automatic schema/permission change is attached to a build, test, startup or Git hook; migrations run only through a future explicitly approved workflow.
