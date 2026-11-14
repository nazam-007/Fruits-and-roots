# Razorpay Test Mode — local testing and migration review

Status: application implementation only. No migrations, database writes, provider
requests or real transactions were executed. Real Razorpay Checkout/webhook delivery
is not yet verified. This is not live-payment support or production authorization.

## Isolated diagnostic startup

From `backend`, `npm run dev` explicitly reads only `.env.razorpay-testing.local`.
It requires project `wznkpgpexjexxzptuuwp`, role `fruits_roots_backend`, verified
TLS, non-production mode and Razorpay test credentials. Missing configuration
refuses startup rather than using `.env` or an inherited database URL. Both
dotenv path aliases are pinned before the application is imported.

This launcher imports the Express app and listens on port 5000 without calling
the payment-expiry worker. Its fixed startup message reports configuration
identity only; it does not establish a live database connection or schema state.
No automated payment, SQL or integration test runs at startup. HTTP mutation
endpoints still exist: do not submit payments/orders without separate approval.

The previous development command remains available as `npm run dev:normal`;
it uses normal dotenv precedence and starts the expiry worker. Production
`npm start` is unchanged. The diagnostic launcher is not a production command.

## Architecture and safeguards

Existing checkout still creates the local order/items/payment with backend prices.
Manual UPI remains the default. Optional Test Checkout selects a separate
RAZORPAY_TEST payment source for that attempt. It cannot subsequently be changed
to manual UPI/demo; cancel and create a new checkout to switch providers.

Checkout requires either configured manual UPI details or valid enabled Razorpay
Test Mode. Test Mode does not require a personal UPI ID. Before provider selection,
the order remains unpaid and pending; the gateway start endpoint binds its provider.
Without manual UPI details, the payment page shows Test Checkout and omits the UPI
QR/reference controls. Manual-only checkout still requires both merchant UPI fields,
and production cannot use the test-mode exception. The `configured` field on
`/payment-config` continues to describe manual UPI; `razorpayTestEnabled` is separate.

Endpoints:

- POST /api/orders/:orderId/razorpay/order — requires order tracking Bearer token;
  checks active pending state, stored order-item sum and server total, converts
  integer INR rupees to paise, creates/reuses a provider order, and stores account,
  amount and order binding. Client amounts are never read.
- POST /api/orders/:orderId/razorpay/verify — requires tracking token and Checkout
  order/payment/signature fields. HMAC uses the stored provider order ID and API
  secret. Server fetches the payment through test-key-authenticated Razorpay API;
  identity, order, amount, currency, capture and refund state are checked.
- POST /api/razorpay/webhook — mounted before express.json with raw body handling;
  checks HMAC-SHA256 using the distinct webhook secret before parsing. Handles
  payment.captured, payment.authorized, payment.failed and order.paid, fetches current
  provider state, and uses the same atomic confirmation function as callbacks.

Captured matching payment atomically marks PAID/PLACED. Duplicate callback/webhook
delivery is state-idempotent using locked payment/order rows and unique provider
IDs; no separate webhook-event ledger is claimed. Delayed failed/authorized events
cannot downgrade paid orders. Failed/authorized payments remain pending and can be
retried. Dismissing Checkout does not confirm or cancel the local order; the existing
explicit cancellation action does. Late/cancelled captured payments are retained
for reconciliation and never place an order. No refunds are automated.

Test records have visible badges and can progress through admin statuses only while
test mode is enabled. They are included in test/demo totals, never manual verified
revenue. Existing production operational filtering excludes them.

## Proposed schema — approval required

Review backend/migrations/016_razorpay_test_payments.sql after 000–015. It adds five
nullable provider fields to payments, extends the payment_source check, adds a
test-binding check and two partial unique indexes. No historical financial rows
are updated/deleted/backfilled. Existing table-level runtime grants cover columns.
The file intentionally fails if applied twice; inspect migration state first.

Do not apply it to the retained populated testing project merely to unblock this
task. Choose an explicitly approved isolated test database, preserve all existing
records/journals, and get separate migration authorization. No new schema is
automatically created on build/startup. Manual UPI works without 016 when gateway
mode is off; gateway endpoints return a schema-readiness error if needed.

After approved application, read-only verification:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='payments'
  AND column_name LIKE 'razorpay_%'
ORDER BY column_name;

SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='payments'
  AND indexname IN ('payments_razorpay_order_uidx','payments_razorpay_payment_uidx');

SELECT conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid='public.payments'::regclass
  AND conname IN ('payments_source_check','payments_razorpay_test_binding_check');
```

Expect five nullable columns, two unique partial indexes and two validated checks.
Never roll back by deleting payments. Disable gateway mode first; rollback of
schema after test records exist requires separate review and audit preservation.

## Private configuration

Backend .env (ignored), on the approved isolated database only:

```dotenv
NODE_ENV=development
RAZORPAY_MODE=test
RAZORPAY_KEY_ID=<test key ID>
RAZORPAY_KEY_SECRET=<test API secret>
RAZORPAY_WEBHOOK_SECRET=<separate Test webhook secret>
DEMO_PAYMENTS_ENABLED=false
```

Use only actual rzp_test_ key IDs. Secrets are never sent to frontend. Only the
public test key ID is returned with the provider order. Missing/off mode disables
the integration; live mode/keys, missing credentials and test mode in production
fail configuration validation. Explicit development/test NODE_ENV is required.
Normal production must leave RAZORPAY_MODE unset/off. Do not set frontend secret
variables or use integration-run approval variables to enable these endpoints.

Current local inspection found the three requested variables present and a test-key
prefix, but no webhook secret. Values were neither printed nor changed. Presence
does not prove credentials are accepted by Razorpay.

## Manual simulated checkout — only after approval and isolated setup

1. Approve isolated database configuration, migration 016 and synthetic application
   writes separately. Do not start the regular backend against a shared database:
   its existing expiry worker performs writes on startup.
2. Populate a synthetic menu and configure opening hours/admin through an approved
   setup. Merchant UPI settings can remain configured for manual-flow testing.
3. Configure automatic capture in the Razorpay TEST dashboard. Authorized-only
   payments deliberately stay pending; signature success alone is insufficient.
4. Start backend with npm run dev from backend; start frontend with npm run dev
   from frontend. VITE_API_URL must match the local backend; FRONTEND_ORIGIN must
   match the actual Vite origin. Do not change development database credentials
   without the isolated configuration approval above.
5. Open the local menu, create a synthetic order, and click Pay with Razorpay Test
   Checkout. Use Razorpay's currently documented TEST payment instruments. Do not
   scan the separate manual UPI QR or make an actual UPI transfer for this test.
6. Check success, failed payment, dismissal/retry, pending capture, explicit cancel,
   expiry, tracking, admin New Orders and Preparing → Ready → Completed. Duplicate
   callback/webhook delivery must not duplicate payment or regress order status.
7. Configure the Test dashboard webhook with its separate secret and a supported
   public HTTPS URL ending /api/razorpay/webhook. Localhost is not directly reachable;
   use an approved tunnel/HTTPS test endpoint. Check current Razorpay domain
   restrictions before selecting a tunnel. Exposing local services requires review.
8. Preserve synthetic audit records. Do not repoint the existing empty-target
   integration runner at a populated database or assume its full suite tests the
   real Razorpay service.

Distributed failure limitation: remote order creation happens under a local row
lock. A provider success followed by local rollback/network failure can leave an
unmapped provider order. Its ID is not returned to Checkout before local commit,
but reconciliation via the test dashboard may be necessary. No cross-system
exactly-once transaction, automatic remote-order retry or refund is claimed.

## Verification

Backend unit/HTTP tests use fake providers and fake database transactions only.
They cover configuration, signatures/raw webhook bytes, paise pricing, ownership,
duplicate creation/confirmation, pending/failed/refunded/mismatched payments,
late-capture reconciliation and production route rejection. Mocked browser tests
cover success and dismissal on desktop/390px/375px. They do not prove actual
Razorpay account setup, provider availability or PostgreSQL constraint behavior.

Official references:
- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- https://razorpay.com/docs/api/payments/fetch-with-id/
- https://razorpay.com/docs/webhooks/validate-test/

Verification results: backend npm test 112 passed, 0 failed, 0 skipped; backend
build passed. Frontend lint/build passed. Focused mocked Playwright Checkout tests:
6 passed, 0 failed (desktop, 390px, 375px). Full maintained Playwright suite and live
Razorpay/database integration were not run. Git whitespace check passed, no unmerged
paths. Local environment files are ignored/untracked; configured Razorpay secret
values were not found in changed nonignored files. Branch main, changes uncommitted.

## Files changed

- README.md
- backend/.env.example
- backend/package.json
- backend/migrations/016_razorpay_test_payments.sql (proposal only)
- backend/src/razorpay.ts
- backend/src/razorpayDiagnostics.ts
- backend/src/razorpayPayments.ts
- backend/src/razorpay.test.ts
- backend/src/routes/razorpay.ts
- backend/src/routes/orders.ts
- backend/src/routes/admin.ts
- backend/src/server.ts
- backend/src/server.security.test.ts
- frontend/src/services/razorpayCheckout.ts
- frontend/src/services/ordersApi.ts
- frontend/src/services/adminApi.ts
- frontend/src/pages/customer/Payment.tsx
- frontend/src/pages/customer/OrderTracking.tsx
- frontend/src/pages/admin/OrderDetails.tsx
- frontend/src/pages/admin/Orders.tsx
- frontend/src/pages/admin/Dashboard.tsx
- frontend/tests/e2e/razorpay-test.spec.ts
- docs/RAZORPAY_TEST_MODE.md

### Safe error diagnostics

Razorpay failures log a JSON record containing only a fixed operation stage, an
allowlisted SQLSTATE (or `unknown`), an allowlisted constraint name (or null),
and a fixed category. Raw errors, messages, causes, request bodies, identifiers,
credentials and SQL parameters are never serialized. Logger failures are ignored
so they cannot replace payment errors or alter transaction handling.

Order creation distinguishes validation/configuration, connection/transaction,
initial schema query, gateway order creation and order persistence. The original
HTTP responses remain unchanged: both 42703 and 23514 still return the existing
migration-016 message; that message alone does not prove a missing migration.
Unknown errors remain unknown rather than being inferred from their text.

Restart the backend with the isolated testing configuration to load diagnostics.
Do not retry a payment merely to collect logs without separate approval for the
write-capable request. On a separately approved attempt, retain only the four-field
diagnostic line. No successful live checkout is established by database-free tests.
