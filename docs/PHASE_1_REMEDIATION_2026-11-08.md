# Production audit remediation — Phase 1

Deployment remains **ON HOLD**. This document supplements, and does not replace, the original 8 November audit.

## Changes

- Repaired maintained Playwright fixtures and assertions without changing customer/admin UI behavior: seven statistics cards including Cancelled; separate tab label/count checks; valid category arrays and product tag arrays; explicit tracking transitions; scoped missing-count alert plus an assertion that no other alerts appear.
- Each Playwright invocation writes to a unique OS temporary directory outside Vite's root, owns its local servers, refuses to reuse existing servers, and runs one worker. Separate invocations cannot silently share servers/output. Run suites sequentially.
- Added a browser contract server running the real Express app with deterministic read-only database fixtures. It overrides DATABASE_URL before importing dotenv/application modules, forbids database connections, and rejects unexpected queries. Browser mutations remain intercepted by individual tests. No shared database is involved in browser runs. Tests formerly described as database-backed now identify their mocked scope.
- Added production-only operational-order filtering shared by dashboard, order list and status counts. Both order and payment must be PAID; the payment must be MANUAL_UPI, have verification timestamp, admin identity and confirmed reference, and not require reconciliation. DEMO and incomplete legacy verification records remain stored but are excluded. Development/test behavior is preserved.
- Fixed the dashboard's empty-operational-set aggregation with a left join and COUNT(o.id), so filtering all historical demo records does not yield an absent summary.
- Added an endpoint regression proving an invented customer reference and a supplied PAID field only request verification. Added production query regression assertions and included order-event tests in npm test.

## Payment safety review

Customer claims store the customer reference separately and transition only to PENDING_VERIFICATION. They never set verified metadata or PLACED. Admin authentication and origin checks precede verification routes. Verification uses one transaction with FOR UPDATE OF o,p; the same confirmed reference is idempotent, different/reused references conflict, and the database has a unique partial index on confirmed references plus one payment per order. Cancelled/expired attempts record late receipts for reconciliation without becoming operational orders. The expiry worker and mutations retain payment history.

These are source/mocked-route findings, not proof of real transaction races. Manual verification remains a human trust boundary: the backend cannot establish bank receipt, amount, recipient, or finality from a typed reference. Staff must independently match all of these; a fabricated admin attestation can still mark an active claim paid. No payment gateway was added. Production readiness is not granted.

Demo isolation uses filtering, not deletion or rewriting financial history. Prefer a dedicated production database and separate development credentials/projects. Existing DEMO records remain available for authorized historical review; they must not appear in production operational lists/counts. Incomplete MANUAL_UPI historical records are also excluded until reviewed through a separately authorized process. No automatic backfill or reclassification is proposed.

## Read-only inspection of the existing database

Metadata only was inspected inside BEGIN READ ONLY transactions, rolled back on completion. No customer/session/payment rows were read, no shared records were written, and no migrations were executed.

- Eleven public tables were observed: products, product_variants, categories, tags, product_tags, restaurant_tables, restaurant_settings, orders, order_items, payments, admin_sessions.
- Current columns include payment_expires_at, payment_source, verified metadata, reconciliation fields, category ordering, opening_hours, and tags. Order/payment status constraints reflect migration 012; confirmed-reference uniqueness and one-payment-per-order uniqueness exist.
- Local history contains incremental migrations 001–013. No visible application migration ledger was found; auth/storage/realtime migration tables are platform-owned and are not application history. Matching columns do not prove every migration was applied exactly. Duplicate order-number/created-at indexes were observed; review later, without automatic removal.
- The inspected constraints did not include orders_fulfillment_type_check from migration 002, despite the fulfillment_type column being present. Treat this as schema/history drift requiring review, not permission to replay migrations automatically.
- **Critical:** admin_sessions has RLS disabled and anon/authenticated roles have SELECT/INSERT/UPDATE/DELETE (and additional) grants. If exposed by Supabase Data API, this may allow forging database-backed admin sessions. The Express route checks alone do not protect that surface. Do not probe by inserting a session. Require a reviewed permission fix (revoke public client access, enable/verify appropriate RLS, preserve only necessary server-role access) and isolated API authorization tests before release.
- Other public tables have RLS enabled; no public policies were returned. Broad anon/authenticated grants still exist and must be reviewed rather than assuming RLS alone solves all privileges. Data API exposure and Storage policies were not fully inspected.
- **High:** the inspected Node client connection was unencrypted; PostgreSQL also reported ssl=false. The database role has BYPASSRLS, CREATEDB and CREATEROLE privileges (not superuser). Configure verified TLS and a dedicated least-privilege application role before deployment. The server may need narrowly scoped policies/grants to preserve its intended access; do not merely switch credentials without testing.

## Disposable integration test strategy

This is a repeatable execution specification, not a claim that integration tests ran. No migrations were executed, even locally, in this phase.

### Provision and isolate (explicit approval required before executing migrations)

1. Choose a disposable local PostgreSQL container/cluster or a separate disposable Supabase project, with its own database, Storage bucket and credentials. Plain PostgreSQL covers transactions/REST; Supabase is additionally required for PostgREST/RLS/Storage authorization tests. Never reuse the shared project or restore customer data.
2. Use a unique run ID and a database named fruits_roots_test_<run>. Place credentials in a temporary untracked file/secret store. Set a separate TEST_DATABASE_URL; the runner must never fall back to DATABASE_URL or backend/.env. Require an explicit destructive-test opt-in, exact host/project allowlist, expected test database name and a run-marker record inside that database. Compare normalized target identity with the shared configuration without printing either URL; abort if equal or unknown.
3. The repository lacks the CREATE TABLE baseline for products, product_variants, restaurant_tables, orders, order_items and payments: migration 001 starts with ALTER TABLE. Obtain a reviewed **schema-only**, no-owner/no-ACL baseline of the pre-001 schema, or a current public-schema snapshot from an approved read-only export. Exclude auth/storage data and all customer/session rows. Preserve sequences, defaults, FKs, check constraints, payment uniqueness and variant uniqueness. Record its SHA-256 and PostgreSQL/extension versions. A current snapshot must not have old migrations blindly replayed over it.
4. Test two explicit paths: approved pre-001 baseline + 001–013 in numeric order; or approved current snapshot + only genuinely unapplied migrations. Use a test-only migration ledger with filename, checksum and applied time. Verify metadata against expected schema after setup. SQL scripts are incremental, not a bootstrap from an empty database.
5. Use an owner role only for setup, then an isolated least-privilege backend role for requests. Keep a separate fixture/inspection connection. Set test-only admin credentials and tracking secret, merchant fixture identifiers, production-like mode with DEMO_PAYMENTS_ENABLED=false, exact local HTTPS frontend origin, and distinct local API/frontend ports. Set expiry to one minute for boundary tests or set fixture timestamps with the test-only connection. Do not call the development demo endpoint to simulate real receipt confirmation.
6. Seed only synthetic products/categories/tags, open hours, and test receipts. Reset by replacing the disposable database/project between runs, never by truncating a shared target. Cleanup must repeat all target identity/marker checks and operate on only the explicitly named test target. Keep failure artifacts outside Vite, with a unique directory per run. Do not log tracking tokens, cookies, merchant secrets, customer data or URLs containing credentials.

### Test matrix and assertions

| Scenario | Required assertions |
| --- | --- |
| 1. Menu retrieval | Real endpoint returns fixture products/variants/categories/tags; archived items absent; unavailable items not orderable; image fallback covered. |
| 2. Cart/server pricing | UI persists variant/quantity; tampered client price/total ignored; unavailable/missing variants, duplicate lines and invalid quantities rejected; backend quote totals exact. |
| 3. Checkout creation | Valid name, optional phone, unique idempotency key and tracking authorization; one order/items/payment set committed; duplicate identical checkout reuses it; mismatched payload conflicts; failure rolls back all writes. |
| 4. Pending payment | Both lifecycle/payment states pending; absent from every operational tab, dashboard total/revenue and status counts; another customer's token cannot read it. |
| 5. Cancellation | Correct token cancels pending attempt idempotently; wrong/missing token denied; no PLACED or paid state; payment history retained; cart preserved. |
| 6. Abandoned expiry | Expiry worker marks abandoned attempt expired without deleting history; endpoints enforce time even before worker tick; claimed-but-unverified attempts also expire. |
| 7. Manual claim | Invented reference produces only PENDING_VERIFICATION; injected PAID/verified fields ignored; appears only in verification queue; retry same reference idempotent. |
| 8. Authorized verification | Authenticated admin confirms synthetic independently matched receipt; order/payment metadata updated atomically; customer immediately sees PAID/PLACED; wrong origin/session rejected. |
| 9. Admin New Orders | Default New tab shows the confirmed order; explicit tabs preserved; counts match DB; production fixture DEMO and incomplete/manual/reconciliation records excluded while still stored. Empty DB returns zero summary. |
| 10. Status lifecycle | PLACED→PREPARING→READY→COMPLETED only; invalid/skipped/repeated transitions conflict; unpaid cannot prepare; completion redirects only after successful update. |
| 11. Tracking | Correct-token GET and SSE follow mutations; wrong-token SSE/GET denied; SSE failure falls back to polling; hidden/resume, stale responses, temporary failures and terminal cleanup tested. |
| 12. Duplicate/concurrent verification | Separate HTTP requests and real connections released simultaneously: same order/reference commits one confirmation; differing references cannot both win; same reference across two orders confirms only one; loser rolls back. Race verification vs cancel and expiry: exactly one allowed outcome; expired/cancelled loser remains reconciliation-only. Inspect final rows and event count, not just response codes. Test deadlock/error rollback and retained records. |
| 13. Admin authorization | Anonymous, expired/forged cookies, disallowed origins denied across reads/mutations/uploads. In disposable Supabase, public client roles cannot read or forge admin_sessions, alter payments/orders, or use service-role privileges. |
| 14. Product/category/tag CRUD | Create/rename/order/delete categories, duplicate/blank validation, assigned-category deletion conflict; product variant/pricing/availability/archive behavior and historical retention; tag create/rename/assign/unassign/delete preserving featured flags; actual persistence after reload. Test Storage type/size/failure handling in disposable bucket. |

Add production demo gating with the flag both false and true, opening/closed days/manual pause, midnight dashboard semantics, and multiple-process SSE as explicit negative deployment tests. Assert no automated refund or payment-history deletion. Run integration suites serially or give each worker an entire separate database; transactions spanning separate HTTP requests cannot be safely isolated by a single outer rollback.

## Production configuration checklist

- [ ] Final HTTPS frontend URL and matching build-time VITE_API_URL; no localhost fallback in shipped bundle; SPA deep-link routing verified.
- [ ] Persistent backend hosting selected; start with one Node process/replica, compatible SSE streaming/no buffering and suitable idle timeouts. Process-local events do not propagate across replicas; sticky sessions alone are insufficient. Keep expiry worker running.
- [ ] NODE_ENV=production and DEMO_PAYMENTS_ENABLED=false in the actual running service; test production demo rejection even with accidental true flag.
- [ ] HTTPS redirects, HSTS and exact HTTPS FRONTEND_ORIGIN allowlist; same-site admin cookie topology; only known proxies trusted and forwarded headers overwritten.
- [ ] PostgreSQL TLS with certificate/hostname verification validated from the running backend; reject unencrypted connections. Do not use rejectUnauthorized=false to make it connect.
- [ ] Dedicated least-privilege DB role with no CREATEDB/CREATEROLE and only reviewed RLS handling; narrowly scoped table/sequence grants. Fix admin_sessions exposure before release.
- [ ] Review all Supabase exposed schemas, anonymous/authenticated grants and RLS using a disposable project first; deny private data/session access. Verify public menu image reads and backend-only Storage writes, approved types and 4 MB limit.
- [ ] Secret manager holds database/Storage/admin/tracking configuration; backend-only service key; no secrets in VITE variables. Stable high-entropy tracking secret and strong admin password hash. Rotate credentials if exposure is confirmed; rotation is a separately authorized operation.
- [ ] Merchant identity and independent receipt-verification procedure approved and tested; matching amount, recipient, reference and final receipt required. No automated bank truth is claimed.
- [ ] Dedicated production data target without demo fixtures; verify historical demo exclusion and zero-order counts. No financial backfill without explicit review.
- [ ] Liveness /api/health and restricted readiness /api/db-health, database connection-pool budget, error/latency/rate-limit alerts, encrypted backups and tested restore. Limit public health-detail exposure and SSE/request resources at ingress.
- [ ] Approved schema baseline/migration ledger/checksums verified; no unreviewed migrations, seeds, deployments or cleanup. All database integration/race/security gates passed before deployment authorization.

## Running the maintained checks

Backend: npm test; npm run build. Frontend: npm run lint; npm run build; npm run test:e2e. Browser tests start their own servers on 127.0.0.1 ports 5181/5191 and refuse occupied ports. They do not require a Supabase connection. Artifacts live under the OS temp directory fruits-roots-playwright-*; pass the corresponding report directory to npm run test:e2e:report -- <report-directory>. Do not run two suites at once; unique outputs avoid file collisions, while exclusive ports prevent accidental shared server state.

## Files modified in this phase

- README.md
- backend/package.json
- backend/src/routes/admin.ts
- backend/src/operationalOrders.ts (new)
- backend/src/server.security.test.ts
- backend/tests/browserServer.ts (new)
- frontend/playwright.config.ts
- frontend/tests/e2e/horizontal-overflow.spec.ts
- frontend/tests/e2e/orders-pagination.spec.ts
- frontend/tests/e2e/smoke.spec.ts
- docs/PHASE_1_REMEDIATION_2026-11-08.md (new)

The previously untracked docs/PRODUCTION_READINESS_AUDIT_2026-11-08.md was preserved without edits. No package-lock changes, dependencies, schema changes or financial-record changes were introduced.

## Final verification

| Command | Final result |
| --- | --- |
| backend: npm test | **46 passed, 0 failed, 0 skipped** (25 top-level tests plus 21 nested subtests) |
| backend: npm run build | Passed |
| frontend: npm run lint | Passed; an intermediate unused type-only fixture constant was corrected before this final check |
| frontend: npm run build | Passed |
| frontend: npm run test:e2e | **104 passed, 0 failed, 16 skipped**, 120 scheduled across three Chromium projects, 8.6 minutes |
| git diff --check | Passed |
| git diff --name-only --diff-filter=U | No conflicts |
| Source/test conflict-marker scan | No markers found |

The 16 skips are existing duplicate viewport-matrix cases in the two mobile projects. The eight-width matrix ran successfully once under the desktop project with its own contexts, including 320, 375, 390, 430 and tablet 768px. All originally reported maintained browser assertion/fixture failures are resolved. No remaining failures in the final executed checks. Expected 409/503 errors in negative-path fixtures are intentional assertions, not ignored test failures.

Existing customer/admin UI, cart/checkout behavior, manual receipt-verification flow, payment records, production demo gate and status lifecycle were preserved. The production operational visibility filter and empty-dashboard handling are the intentional backend behavior changes. Real database transactional/concurrency behavior, Supabase Data API/Storage authorization, genuine receipt matching, deployment security and multiple-process SSE are not certified by these mocked/contract suites. Today's dashboard status metrics versus unfiltered all-date status counts also remain a midnight semantics review item.

Final branch: **main**. Eight tracked files modified and three new files created by this phase; the pre-existing untracked original audit remains untouched (12 paths shown in git status). git diff --stat reported 8 tracked files, 166 insertions and 23 deletions; new untracked files are not included in that statistic. No unresolved conflicts, generated tracked changes, dependency/lockfile changes or introduced real credentials. All changes remain uncommitted. No commit, push, merge, branch switch, deployment, migration execution, shared database write or payment integration occurred.

Required follow-up authorization: reviewed database permission/TLS/role remediation and any migration/deployment execution. Before production approval, obtain the schema baseline and disposable target, execute the full integration matrix there, address the critical session-table exposure, and establish the approved receipt-verification operating model. The inspected shared database was used only for read-only metadata review.
