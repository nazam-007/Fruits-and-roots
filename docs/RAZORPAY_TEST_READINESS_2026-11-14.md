# Razorpay Test Mode readiness and Git review — 14 November 2026

Decision: ready for review of this test-only follow-up; NOT ready for live-payment
launch. No live keys, deployment, migrations, database-writing tests or webhook
replays were performed during this review.

## Git baseline and scope

The starting working tree was clean on main at 04709b4, the merge of PR #25
(`implement razorpay payment testing`, implementation commit dec6c57). The original
27-file Razorpay change is already tracked/merged; it must not be staged again as
though it were new. Created feature branch `codex/razorpay-test-readiness` for this
follow-up. No commit, push or additional merge was performed.

Reviewed the merged change covering the payment service/provider, routes, startup,
diagnostics, schema proposal, admin test-mode handling, customer checkout/tracking,
frontend service types, browser/security tests, examples, ignores and documentation.
All referenced payment prices remain backend-calculated. No payment business
logic, authorization, financial records, schema or private configuration changed
in this follow-up.

## Reviewed staging scope

Only these four files belong to the follow-up:

- `backend/src/razorpay.test.ts`
- `frontend/tests/e2e/razorpay-test.spec.ts`
- `docs/RAZORPAY_TEST_MODE.md`
- `docs/RAZORPAY_TEST_READINESS_2026-11-14.md`

Review with `git diff` and the new report before staging. Avoid `git add .` or
`git add -f`. The supplied `feat: integrate Razorpay test checkout and payment
verification` describes the already-merged implementation; a follow-up message
such as `test: verify Razorpay declines and document release readiness` describes
this branch more precisely. Commit/push remain approval-gated.

## Private-data review

- The 27 merged files had no detected matches to locally configured private
  credentials, database URLs or personal merchant UPI values, and no detected
  credential-shaped Razorpay/secret key, JWT or private-key block.
- A second scan of all 138 tracked file paths/text files found no matches to the
  configured private values. Pattern/exact-value scans are evidence, not a proof
  that every possible unknown secret is absent. Final staging must use the list.
- No real environment files, recovery journals or integration artifacts are tracked.
- Git ignore checks cover backend `.env`, `.env.integration.local`,
  `.env.razorpay-testing.local`, certificates and `integration-artifacts/`, and
  frontend `.env`/`.env.local`. Existing fake test credentials and localhost
  database URLs are synthetic fixtures, not real connection credentials.
- No secret values, actual payment identifiers, signatures, personal UPI details
  or recovery-journal contents are included in this report/staging set.

## Evidence and tests

User-reported manual evidence: simulated successful Netbanking reached tracking
and Admin New Orders; admin lifecycle updates appeared at the customer frontend.
A provider-declined payment returned to the payment page and was reported absent
from operational orders. The user also confirmed paid-then-cancelled orders appear
in Admin Cancelled and unpaid cancellations stay out of operational Admin Orders.
These are manually passed scenarios, not independent database inspection.

Current database-free verification:

| Command | Result |
| --- | --- |
| Backend `npm test` | 133 passed, 0 failed, 0 skipped |
| Backend `npm run build` | Passed |
| Frontend `npm run lint` | Passed |
| Frontend `npm run build` | Passed |
| Frontend `npx playwright test tests/e2e/razorpay-test.spec.ts` | 12 passed, 0 failed |
| `git diff --check` | Passed |

Added a fake-transaction regression for a declined payment observed by concurrent
callback/confirmation paths: order/payment remain pending, no confirmed provider
payment ID is recorded, no operational placement event is published, and retry
reuses the provider order. Existing Admin Orders/dashboard tests check the shared
PAID-only operational predicate, including its stricter production restrictions.
The browser suite now explicitly raises `payment.failed`: no verify request or
navigation to confirmed tracking is allowed. The suite runs on desktop/390px/375px
with isolated fixture servers, fake database operations and mocked payment APIs.

No full maintained browser suite or real PostgreSQL concurrency run is claimed.

## Webhook review

The raw-body route precedes JSON parsing, checks HMAC with the separate webhook
secret, fetches authoritative provider state and uses locked order/payment rows
for state idempotency. Missing secret refuses webhook handling. The ignored testing
configuration currently has no webhook secret; actual delivery is unverified.
No event-ID ledger is implemented, and no cross-system exactly-once guarantee is
claimed. Provider fetch/row-lock latency can cause retries; record and evaluate
delivery outcomes in the separately approved test.

Follow the explicit Test-dashboard/HTTPS/signature/replay checklist in
`docs/RAZORPAY_TEST_MODE.md`. Approval is needed before configuring public exposure,
credentials, new synthetic payments or replaying signed deliveries. Provider docs:
[validation/testing](https://razorpay.com/docs/webhooks/validate-test/) and
[delivery best practices](https://razorpay.com/docs/webhooks/best-practices/).

## Remaining real-database tests — separate target/commands approval required

Use approved run-labelled synthetic records in an isolated environment; preserve
the populated project and its recovery journal. Do not bypass the existing
empty-target integration runner or delete financial records to make it pass.

| Scenario | Required assertions |
| --- | --- |
| Concurrent provider-order creation | Same local order yields one committed provider binding; inspect any remote orphan after a failed local commit. |
| Concurrent callback + signed captured webhook | Two simultaneous confirmations for the same order/payment result in one confirmation, one placement, no duplicate revenue, valid locked transaction behavior. |
| Duplicate callback/webhook after completion | Repeated confirmation remains idempotent; COMPLETED/READY/PREPARING cannot regress to PLACED. |
| Competing payment identities | Only one captured payment can confirm a local order; a different payment ID conflicts without overwriting history. |
| Provider identity reuse/mismatched binding | Wrong order/account/amount/currency is rejected; partial unique indexes prevent duplicate provider identities across rows. |
| Failed/authorized payments | Repeated events keep order unpaid/pending and excluded from every operational order list, dashboard count and verified revenue. |
| Cancellation/expiry versus capture | Captured late payments are retained for reconciliation; cancelled/expired attempts never silently become PLACED. |
| Transaction interruption | Statement/lock timeout and connection loss do not partially confirm an order; verify audit/reconciliation state before any rerun. |
| Actual webhook delivery/retry/order inversion | Correct HMAC accepted, altered signatures rejected; late failed/authorized events do not downgrade paid state; dashboard delivery outcomes checked. |
| Cancellation visibility regression | User manually confirmed paid cancellations appear in Cancelled and unpaid cancellations stay out of operational lists. Include this in the future isolated database regression run. |

Cancellation visibility is manually confirmed by the user's subsequent explicit
clarification. No database mutation/replay command is approved or executed by this
report; a future real-database regression remains a separate verification level.

## Release blockers

1. Test-only gateway: production explicitly rejects Razorpay Test Mode and live
   keys are unsupported. Any live-payment implementation requires a separate task.
2. Actual webhook delivery and real PostgreSQL duplicate/concurrent/race behavior
   remain unverified. The earlier interrupted manual-UPI integration run is not a
   successful gateway integration result.
3. Repository migration 016 lacks the explicit `razorpay_key_id IS NOT NULL`
   guard manually applied and verified in testing. Reconcile source/history through
   a reviewed migration decision; do not reapply 016 or alter records automatically.
4. Client-to-pooler TLS was previously verified; pooler-to-database encryption was
   not established and reported no SSL. End-to-end encryption remains unverified.
   Use a supported direct verify-full route where feasible or formally assess the
   production route before launch.
5. A separate production database/configuration, secret management, HTTPS/domain,
   backup/recovery and production smoke checks still require explicit review.
6. Diagnostic startup intentionally disables the expiry worker; manual expiry
   behavior cannot be inferred from leaving that backend running. Production
   worker/SSE single-process deployment requirements remain a deployment concern.

Do not mark real-customer payments or production deployment ready based on the
successful simulated happy path alone.
