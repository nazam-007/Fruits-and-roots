# Production readiness audit — 8 November 2026

**Decision: HOLD deployment. Production readiness is not established.**

No Razorpay integration, application fixes, commits, pushes, deployments, migrations, or shared database writes were performed. Initial branch: `main`; initial working tree: clean. AGENTS.md was read first. Git required a command-scoped safe.directory override because the sandbox account differs from the repository owner; global Git configuration was not changed.

## Passed checks

| Check | Result and scope |
| --- | --- |
| Backend configured tests | `npm test`: 43 passed, 0 failed. Database calls in security/route tests are mocked. |
| Order event isolation | `node node_modules/tsx/dist/cli.mjs --test tests/orderStatusEvents.test.ts`: 1 passed. This test is omitted from the normal npm test script. |
| Backend production compilation | `npm run build`: passed. |
| Frontend production compilation/bundle | `npm run build`: passed. |
| Frontend lint | `npm run lint`: passed. |
| Demo payment production gate | Isolated process with NODE_ENV=production and DEMO_PAYMENTS_ENABLED=true: demo POST returned intentional 404; payment configuration returned demoPaymentsEnabled=false. Dummy database URL; no database access required. |
| Backend access controls | Mocked tests reject unauthenticated admin dashboard, settings, orders, verification, category/tag/product mutations and image uploads. Missing customer tracking token is rejected. |
| Payment-attempt lifecycle | Mocked tests cover paid-only operational queries, authenticated/idempotent pending cancellation, expiry preserving history, verification idempotency, and expired receipts remaining in reconciliation. |
| Restaurant scheduling | Tests cover Asia/Kolkata opening boundaries, overnight hours, closed days, all-day opening, manual pause, malformed/overlapping schedules, and checkout rejection when unavailable. |
| Focused browser regressions | 12 passed in the layout/admin selection: dashboard card links; mobile tags; selected sizes/prices; accessible mobile and desktop size dialogs; paused/closed menu messaging; pending cancellation back to cart; reduced motion; back-scroll restoration; keyboard-height checkout actions; card/image geometry; cart totals and fixed checkout actions. |
| Dashboard refresh browser check | Mocked dashboard auto-refresh test passed. |

Image/card tests exercise 320, 360, 375, 390, 414, 430, 768 and 1440px with fixture images. This verifies sizing and reserved geometry, not actual production image availability or measured cumulative layout shift on slow devices.

## Failed tests and limitations

Existing layout/admin run:

`node node_modules/@playwright/test/cli.js test horizontal-overflow.spec.ts orders-pagination.spec.ts dashboard-order-card-links.spec.ts --project=chromium-desktop`

Result: **12 passed, 9 failed**. All eight full-route viewport cases stopped at a stale assertion expecting six dashboard cards; the application intentionally renders seven, including Cancelled. These failures do not prove horizontal overflow. They prevent the remainder of those cases from verifying admin menu/settings and editor layouts. The pagination case expects a button matching `New 15`; that assertion failed and needs comparison with current accessible tab labels/count semantics.

Selected smoke run:

`node node_modules/@playwright/test/cli.js test smoke.spec.ts --project=chromium-desktop --grep 'tracking sees|dashboard auto-refreshes|all-time count is missing'`

Result: **1 passed, 2 failed**. Tracking fixtures advance status on each request; the snapshot reached Completed before the test observed the Preparing emphasis. Treat this as a timing-sensitive test requiring deterministic status control, not proof that tracking is broken or fully verified. The missing-dashboard-count test matches two alerts because restaurant status was not mocked. Its snapshot correctly displayed an unknown count rather than zero.

A temporary corrected layout test was also used diagnostically. Correcting only the card count exposed missing category/tag fixtures: the category endpoint defaulted to an object instead of an array. A further diagnostic run with array fixtures reached the mobile editor action, which was disabled because its fixture contained no categories; it was stopped after reproducing these fixture limitations. No diagnostic matrix pass is claimed. Diagnostic tests are not changes to the maintained test suite. Concurrent original/smoke runs also collided in Playwright's default artifact directory, producing an additional trace-copy error; use distinct output/report directories for separate runs. Vite also watched generated report files and triggered reloads, so future browser runs should write artifacts outside its watched root or use the production preview server.

The complete maintained Playwright suite has **not passed**. Full database-backed menu → cart → checkout → bank receipt → admin verification → preparation → completion was **not executed**. No disposable database or verified isolated backend was provided; local credentials must not be presumed safe for test writes. Successful product/category/tag CRUD, image upload persistence, database constraints, transition races, and live Supabase policies remain unverified. Browser mocks and SQL-string assertions are not substitutes for these tests.

## Critical and high-priority findings / required fixes

### Payment release blocker: receipt truth remains a manual trust boundary

`backend/src/routes/admin.ts:697` accepts an authenticated admin's PAID decision and a reference string of at least four characters. It records verification metadata and places an active manual claim. It does not query a bank/provider to verify receipt, amount, merchant, or payment finality. The UI explicitly asks staff to independently check merchant bank/UPI records.

No unauthenticated customer self-confirmation bypass was found in the reviewed paths: a customer claim becomes PENDING_VERIFICATION; production demo confirmation is disabled. However, an authenticated admin can attest an invented receipt/reference and produce PAID/PLACED without independent machine evidence. This is a manual-verification design limitation, not evidence of a customer authorization bypass. Under the requested rule against falsely confirmed real payments, **do not certify production readiness**. Before accepting real money, establish and test a trusted receipt-verification process and explicitly approve the manual operating model, or separately authorize a server-verified payment integration. Razorpay was not integrated.

### High: production operational lists can include historical demo records

`backend/src/routes/admin.ts:339` and `:397` select operational records using orders.payment_status=PAID, without a production-only trusted-source restriction. Historical paid DEMO records remain visible and counted if development data is reused. Verified revenue separately requires MANUAL_UPI and verified_at, so demo revenue is not directly counted as verified revenue by these queries. Start production with a dedicated database without demo fixtures; consider enforcing trusted payment-source/verification consistency for operational records. Do not delete existing records automatically.

### High: deployment security configuration is not verified

All essential local variable names were present and nonempty; deployed values were unavailable. Local settings are development settings: production mode is off, the demo flag is not false, and the frontend origin is not HTTPS. The local database URL does not explicitly request TLS through sslmode, and db.ts does not independently configure SSL. This does not prove the local connection is plaintext; it means verified production TLS is not established. Do not copy local settings into production. Verify database TLS, least privilege, schema state, Supabase grants/RLS and Storage policies before release.

### High for multi-process hosting: order SSE events are process-local

`backend/src/orderStatusEvents.ts` publishes to an in-memory map. `frontend/src/hooks/useOrderStatusUpdates.ts` stops polling when its SSE stream opens. With multiple backend processes, an admin mutation handled by another process may not reach an otherwise healthy customer stream. Use one persistent backend process initially, or separately implement/test cross-process delivery or periodic reconciliation. Sticky sessions alone do not ensure admin and customer requests share a process.

### High release-validation gap: tests are not green and financial flow lacks real integration coverage

Repair stale/incomplete browser fixtures and accessible selectors; include order-event tests in the standard command. Run successful and rejected CRUD, authorized/unauthorized transitions, payment claims, arbitrary customer references, duplicate receipts, expiry/cancellation races and full tracking against an isolated migrated database. Test the approved payment trust boundary using independently established receipts. Re-run the complete suite before approval.

## Additional security and reliability findings

- Positive source findings: scrypt passwords; hashed random admin sessions; HttpOnly/SameSite=Strict cookies with Secure in production; exact configured admin Origin check; parameterized database queries; Zod input limits; backend pricing; transactional row locks for verification/transitions; tracking bearer tokens checked against stored hashes; Helmet; exact CORS grants; image type/size/signature validation; backend-only Storage service key.
- CORS restricts browser grants, not arbitrary HTTP clients. Public endpoints remain public by design. Admin authorization is independently enforced.
- Rate limiting is per-process memory. Login limiter entries have no cleanup; public catalog SSE has no connection cap. Apply ingress request/connection limits; verify trusted proxy settings. Distributed limits require a separately approved implementation if scaling.
- Only restaurant_settings explicitly enables RLS in the supplied migrations. Absence of RLS statements elsewhere is not proof of deployed exposure; actual grants, policies and roles must be inspected. Never expose orders, payments or admin_sessions through anonymous Supabase access.
- Tracking and polling code preserves prior data, guards overlapping/stale responses, pauses on hidden documents, and cleans up resources. Runtime resilience under slow networks and multiple instances still needs integration verification.
- Dashboard SQL groups by local_day after joining operational_orders. With zero paid orders there is no group, so summary.rows[0] is undefined. This is a source-derived empty-database defect, not an executed PostgreSQL reproduction. Return an explicit zero-valued summary and test a fresh restaurant database.
- Dashboard active-status counts are restricted to orders created today, whereas unfiltered Orders status counts cover all dates. A pending order crossing midnight can be omitted from today's active dashboard metrics. Confirm intended labels/semantics and test the boundary.
- VITE_API_URL silently defaults to localhost. The frontend build succeeds without a production API URL; add a deployment validation step so a successful build cannot ship a localhost API target.
- Full error middleware, ingress resource limits, monitoring, backup/restore and real-device behavior were not certified by compilation or mocks.

## Recommended deployment configuration

| Variable | Required production treatment |
| --- | --- |
| NODE_ENV | production |
| DEMO_PAYMENTS_ENABLED | false; production gate was tested even with true |
| PORT | Match the hosting process/health-check configuration |
| FRONTEND_ORIGIN | Exact HTTPS frontend origin(s), no paths/wildcards; production startup validates this |
| DATABASE_URL | Dedicated least-privilege production database connection with provider-supported verified TLS settings |
| ORDER_TRACKING_SECRET | Stable high-entropy secret, at least 32 bytes; replacing it affects new/retried tracking token derivation |
| ADMIN_USERNAME / ADMIN_PASSWORD_HASH | Dedicated admin identity and generated scrypt hash; store securely |
| MERCHANT_UPI_ID / MERCHANT_UPI_NAME | Independently validate the real merchant recipient and receipt-verification procedure |
| PENDING_PAYMENT_EXPIRY_MINUTES | Optional; defaults to 30; valid range 1–1440 |
| SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY | Required for image uploads, HTTPS Storage endpoint; service key backend-only |
| MENU_STORAGE_BUCKET | Explicit bucket name; public menu-image reads only; controlled writes; 4 MB JPEG/PNG/WebP limits |
| TRUSTED_PROXY_IPS | Only actual trusted proxy IPs/CIDRs that overwrite forwarded headers; otherwise leave unset |
| VITE_API_URL | Required at frontend build time: real HTTPS API base URL, never secrets or localhost |

No essential local variables were missing/empty. Optional expiry/proxy variables were absent locally and have defaults. Presence does not establish correctness, entropy, credentials validity, or deployment configuration. No secret values are included in this report.

Use HTTPS frontend and API on the same site (prefer a reverse proxy under one origin), because admin cookies are SameSite=Strict. A cross-site API hostname may prevent authenticated browser requests even when CORS is configured. Configure SPA fallback routing. Keep one persistent backend process with SSE buffering disabled and stream-friendly timeouts; the expiry worker runs at startup and every minute. Confirm database connection-pool capacity and health monitoring. Review migrations 001–013 against actual target schema; back up and apply only through an approved workflow. Do not run seedMenu against production. Configure Storage policies, backups, alerts and logs that redact tokens/customer information.

## Files and existing functionality

Audit report only; application source and maintained tests were preserved. Temporary diagnostic fixtures are removed after testing. Build/test outputs may be ignored artifacts. Existing functionality was preserved by making no application edits; this is not a claim that untested flows work.

## Approval and release gates

No approval is requested to deploy from this audit: deployment remains blocked. Any production deployment, database migration/data cleanup, payment integration, new infrastructure/dependency, commit or push needs the applicable explicit authorization. No migrations or real payment-provider integration were performed.

## Final Git status

Branch: `main`. Only uncommitted file: this new audit report (`?? docs/PRODUCTION_READINESS_AUDIT_2026-11-08.md`). No tracked application/test changes. `git diff --check` passed; `git diff --stat` was empty because the report is untracked. `git diff --name-only --diff-filter=U` returned no conflicts. No merge markers were found in reviewed source/migrations. Temporary test source was removed; diagnostic outputs were moved under ignored `frontend/test-results/audit-diagnostics`. Audit-started local servers were stopped; the pre-existing server on port 5173 was not stopped.
