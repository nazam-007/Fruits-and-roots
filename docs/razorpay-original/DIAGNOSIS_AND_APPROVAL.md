# Original-project Razorpay 42703 diagnosis — 2026-11-15

Status: root cause confirmed through read-only schema metadata. No migration, payment request, financial-record change, role/grant change, service restart, commit/push/deployment performed by this task. Retained testing project was not contacted or changed.

## Connection and observation
Normal backend dev runs tsx watch src/server.ts. db.ts loads dotenv/config, which selects backend/.env when launched from backend; it does not automatically load .env.integration.local or .env.razorpay-testing.local. Pre-existing process variables override normal .env. Inspection shell had no inherited DATABASE_URL. Normal file targets mrjsfznxbwjsdzyuzvsi, postgres login, aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres. It has NODE_ENV=development, RAZORPAY_MODE=test, valid test-key format and a present secret; webhook secret is absent. DATABASE_TLS_MODE is unset, so normal development defaults to disable. This is file/shell evidence, not a claim to have read a different running process's effective environment.

Dedicated inspection independently pinned the original project-qualified login and endpoint, required trusted CA/certificate/hostname validation, opened REPEATABLE READ READ ONLY, confirmed current_user/session_user/database=postgres and transaction_read_only=on, set statement_timeout=15s, lock_timeout=5s, idle timeout=30s. Only information_schema/pg_catalog metadata SELECTs were run, no application rows read. Completed ROLLBACK/connection close. TLS authorization and hostname verification passed; protocol was not retained in this diagnostic output. This does not verify pooler upstream encryption or normal app's TLS.

## Exact failing SQL
backend/src/razorpayPayments.ts start() calls the following query at razorpay_schema_check (parameter $1 is an authorized order ID; no actual ID is printed):

```sql
SELECT o.id,o.total_amount,o.payment_status,o.order_status,o.tracking_token_hash,
  (o.payment_expires_at > NOW()) AS payment_attempt_active,p.payment_source,
  p.payment_status AS recorded_payment_status,p.razorpay_order_id,p.razorpay_payment_id,p.razorpay_key_id,
  p.razorpay_amount_paise,p.reconciliation_required,
  (SELECT SUM(quantity::bigint*unit_price) FROM order_items WHERE order_id=o.id)::text AS item_total
FROM orders o JOIN payments p ON p.order_id=o.id
WHERE o.id=$1 FOR UPDATE OF o,p;
```

Application relations, not system catalogs. Every non-Razorpay column needed by this query and subsequent persistence was found. First absent reference is p.razorpay_order_id; p.razorpay_payment_id, p.razorpay_key_id and p.razorpay_amount_paise are also absent. payments.razorpay_last_status (used by subsequent persistence) is absent too. No Razorpay columns, indexes or binding constraint exist; validated payments_source_check does not include RAZORPAY_TEST. This establishes migration-016 schema ABSENT, not partially applied. Actual postgres can SELECT/INSERT/UPDATE checked relations; 42703 is not a missing-grant symptom. fruits_roots_backend is absent in original, matching earlier security findings.

The client message comes from routes/razorpay.ts mapping 42703/23514 to HTTP 503; in this case missing schema is confirmed. The locking/price/tracking query itself is correct; no suppression or query workaround is needed. Canonical 016 was originally proposed only for isolated testing, so do not blindly replay it against original. Schema readiness and successful server startup are different checks.

## Exact proposed fix (NOT EXECUTED)
Review proposed_016_original_razorpay_schema.sql. It contains the 016-equivalent additive changes for this observed absent schema, with a current-user/database sanity check and an absent-column/validated-source-constraint guard. Actual target identity MUST be independently pinned by connection, not current_database alone. The proposal refuses partial/already-applied schema rather than silently hiding drift.

Adds payments varchar(100) razorpay_order_id/payment_id/key_id, bigint razorpay_amount_paise and varchar(30) razorpay_last_status; all NULLABLE with no defaults. Replaces only payments_source_check, preserving DEMO/MANUAL_UPI while allowing RAZORPAY_TEST. Adds test-binding check requiring non-null test order/key/positive amount and rzp_test_ prefix. Creates unique non-null order/payment gateway ID indexes. No UPDATE/DELETE/backfill, no new tables/sequences/triggers, no grants, no changes to products/orders/sessions/admin records or application policies. Existing manual UPI records retain their source/status/reference; nullable additions and source-discriminated check accommodate them.

Canonical backend/migrations/016_razorpay_test_payments.sql also now requires razorpay_key_id IS NOT NULL. Without this explicit guard, SQL CHECK can accept UNKNOWN when key_id is NULL. This is a proposal-source correction, not a change to any previously applied database constraint. No other backend business logic changed.

## Risks and approval stop points
1. Proposed SQL remains unexecuted. Original-project testing was NOT authorized by the older isolated-test-only migration header; this new original-target file requires explicit approval of its exact contents/hash.
2. ALTER TABLE/constraint validation takes locks and scans; indexes take time/resources. Entire file uses BEGIN/COMMIT, lock_timeout=5s, statement_timeout=30s. Error -> aborted transaction, ROLLBACK/close; do not widen timeouts or auto-retry silently. No rerun after partial result without metadata review. Successful COMMIT is not automatically reversible; do not drop audit columns/indexes or delete records as rollback. Prepare a reviewed forward correction if needed.
3. Normal server starts paymentExpiry immediately and every minute (inspect EXPIRY_INTERVAL_MS for exact implementation). It can UPDATE existing pending orders/payments independent of Razorpay. Do not start/restart/retry against original under this approval. Obtain separate approval to pause relevant application/worker processes before schema execution/testing. A failed initial Razorpay SELECT rolls back its own transaction before gateway creation/persistence; this does not establish that separate expiry/checkout activity made no earlier changes.
4. Normal runtime is overprivileged postgres and lacks configured verified TLS. Fix reviewed runtime configuration/least privilege separately before public use; do not copy preview SELECT role into full app. No credentials/configuration were changed here.
5. This remains TEST MODE only, refuses live keys and NODE_ENV=production. A test payment can create operational test states in development; do not mix real café operations with test execution on original without an explicit plan. Production filters exclude test sources, but that does not make original testing automatically safe. Webhook testing additionally requires private test webhook secret/URL, raw-body signature verification and separate delivery approval.

## Verification after separately approved application
1. Recheck exact source/hash, target/TLS/identity and metadata drift before execution. Separately approve complete proposed SQL, coordinate worker stop/change window; do not include menu restoration or other security proposals implicitly.
2. After approved COMMIT, run verify_016_metadata.sql via the same independently pinned READ ONLY verification procedure. Expect five nullable/no-default columns, exact lengths/types, two validated checks including key non-null guard, two valid unique partial indexes. No application records queried.
3. Do not use npm run dev merely as a read-only health check: it runs expiry writes. Separately approve any runtime configuration changes/restart and subsequent original-project synthetic checkout/payment test. Verify bound order/amount/signature/provider capture and unpaid exclusion before admin/tracking checks; do not assume schema verification confirms payments.
4. Safe database-free commands from backend: npm test; npm run build. From frontend: npm run lint; npm run build; npx playwright test tests/e2e/razorpay-test.spec.ts tests/e2e/smoke.spec.ts --grep 'Razorpay|checkout|customer tracking|admin login'. These commands use mocks/isolated harnesses and do not apply proposed SQL.

## Test results
Backend npm test: 135 passed, 0 failed, including missing-column rollback/no-provider-call and SQL CHECK NULL-guard regressions. Backend TypeScript build passed. Frontend results appended after completion. No real database-writing integration suite or gateway/webhook request was executed.

Completed: frontend lint and production build passed; 30 focused mocked browser tests passed, 0 failed (12 Razorpay scenarios plus checkout/auth/tracking coverage across desktop and two mobile projects). Git whitespace checks passed. Proposed SQL SHA256: 2c5e5f0c704c1e5d5eba7be95b211e02296b37f206c5ee1ab9454b3c5a87964e. No runtime business-logic change was required. Existing changes preserved on main.
