# Fruits & Roots E2E Test Report

**Run date:** 2026-10-31  
**Overall result:** Partial verification only; not a full release sign-off.

## Environment

- Browser: Playwright Chromium.
- Frontend: `http://localhost:5173`.
- Backend API: `http://localhost:5000`.
- Viewports: desktop 1440 × 900; mobile 390 × 844 and 375 × 667.
- The frontend and backend development servers were already running.
- Backend `.env` exists, but its database target was not inspected or assumed isolated. Tests were limited to read-only API requests, rejected invalid payloads, local browser storage, or mocked frontend responses. No order, product, payment, session, or storage mutation was attempted.
- No admin credentials, tracking token, database secret, or service-role key was read or embedded in test files.

## Tests implemented

- Playwright configuration for Chromium desktop and two Chromium mobile viewports, serial execution, HTML report, failure screenshots, and retained-on-failure traces.
- Read-only customer menu API/UI smoke tests for loading, categories, search, product prices, availability display, and product image rendering.
- Local cart tests for quantity changes, totals, persistence, removal, and empty state.
- Checkout form smoke check for optional phone without submitting an order.
- Mocked tracking status progression and terminal polling-stop check.
- Mocked dashboard all-time count auto-refresh check.
- Anonymous admin API denial, invalid customer tracking access, invalid order payload, CORS, and security header checks.
- Viewport overflow checks on representative customer and public admin login pages.

The test command is `cd frontend; npm run test:e2e`. `FRONTEND_BASE_URL` and `API_BASE_URL` can override the default local URLs. No web servers are launched automatically.

## Results

| Test group | Result | Notes |
|---|---|---|
| Playwright Chromium desktop | **11 passed** | Read-only and mocked smoke checks. |
| Playwright Chromium 390 × 844 | **11 passed** | Responsive smoke checks. |
| Playwright Chromium 375 × 667 | **11 passed** | Responsive smoke checks. |
| Playwright total | **33 passed, 0 failed** | Full final run completed in approximately 2.2 minutes. |
| Backend unit/security tests | **13 passed, 0 failed** | Includes legacy scrypt compatibility, longer-password support, unauthenticated admin route/image upload denials, invalid tracking access, origin rejection, and security headers. |
| Frontend production build / TypeScript | **Passed** | Vite production build completed. |
| Backend TypeScript build | **Passed** | `npm run build`. |
| Playwright config/spec TypeScript check | **Passed** | Explicit strict `tsc --noEmit` check. |
| Frontend full lint | **Failed on existing unrelated issue** | `src/context/CartContext.tsx:156` reports `react-refresh/only-export-components`; no lint errors were reported for the E2E test files. |
| Backend `npm audit` | **Passed** | Zero vulnerabilities. |
| Frontend `npm audit` | **Warnings** | 12 moderate advisories in the ESLint/typescript-eslint development dependency chain (`minimatch`); remediation suggests a breaking `--force` dependency update, which was not applied. `npm audit --omit=dev` reports zero production dependency vulnerabilities. |
| Production build | **Frontend passed** | Backend TypeScript build passed; no deployment performed. |

The first exploratory Playwright run exposed test-selector/configuration mistakes (including use of a WebKit device descriptor). These were corrected; the final complete run above passed. No confirmed application bug was found by the final suite.

## Skipped / blocked

The following workflows were not executed because an isolated disposable test database, test admin credentials, and test Storage bucket were not provided or verified:

- Successful backend admin login/logout, session expiry, and authenticated admin operations.
- Creating customer orders, demo-payment mutations, and database-backed customer-to-admin status workflow.
- Actual payment verification, invalid status transition persistence, and database-derived dashboard metrics.
- Admin product CRUD/status/archive, successful or rejected image upload against Storage, and fixture cleanup.
- Production-mode demo-payment denial on a separately configured production-like test server.
- Cart/checkout end-to-end order creation, optional-phone successful submission, and idempotent retry against PostgreSQL.
- Mobile payment and order details with real fixture data.

The automated suite does not claim coverage of those paths. Follow the [manual checklist](./MANUAL_E2E_TEST_CHECKLIST.md) after provisioning an isolated test environment.

## Screenshots and traces

- Final successful run produced an HTML Playwright report in `frontend/playwright-report/`.
- Failure screenshots/traces are configured for future failures. No application failures occurred in the final run, so final-run failure screenshots/traces were not generated.
- Initial exploratory failures were test harness issues and were corrected; no failure artifacts are treated as final application defects.

## Findings and recommendations

- **Critical:** None identified by the executed tests.
- **High:** None identified by the executed tests.
- **Medium:** Full state-changing workflows remain unverified until an isolated database and test Storage bucket are available.
- **Low:** Resolve the existing `CartContext.tsx:156` lint error separately. Review and schedule a compatible update for the 12 moderate frontend development-dependency advisories; avoid unreviewed breaking dependency upgrades.

## Remaining manual checks

1. Complete `E2E-01` with customer/admin windows using disposable test fixtures.
2. Verify true database-backed dashboard totals and status/payment transitions against expected isolated-database queries.
3. Exercise successful admin authentication, logout, and expiry.
4. Verify Supabase PostgreSQL grants/RLS and Storage bucket/object policy from the provider console.
5. Test production HTTPS, Secure cookie, HSTS, exact CORS origins, and demo-payment denial in a staging environment.
6. Review visual mobile layouts and accessibility on physical devices if those are supported release targets.

**Release readiness:** Suitable for continued development testing. The read-only/mocked E2E checks are green, but full customer-to-admin transaction and production configuration testing remain blocked; do not treat this report as complete end-to-end or production security approval.
