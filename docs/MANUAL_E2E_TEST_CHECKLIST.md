# Fruits & Roots Manual E2E Test Checklist

## Safety and setup

- [ ] Use a dedicated test deployment and isolated test database. Do not use the restaurant's shared or production database.
- [ ] Confirm backup/restore or disposable fixture setup before creating, changing, or archiving records.
- [ ] Configure the test backend with `NODE_ENV=development`, `DEMO_PAYMENTS_ENABLED=true` only for demo-payment cases, and test-only admin credentials.
- [ ] Use a test-only Storage bucket and safe JPEG/PNG/WebP fixture. Never use a real UPI account.
- [ ] Use separate customer and admin browser windows/profiles for the cross-role order workflow.
- [ ] Record the app version, browser/version, viewport, test database identifier (not credentials), date, and tester.
- [ ] Keep passwords, session cookies, tracking tokens, database URLs, and service-role keys out of screenshots, notes, and logs.

Enter results as tests are performed. “Actual result”, “Pass/Fail”, and “Notes” are intentionally blank.

| Test ID | Feature | Preconditions | Test steps | Expected result | Actual result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|---|
| MENU-01 | Customer menu | Test app and API available | Open `/menu`. | Menu loads products from the API; no loading/error state remains. | | | |
| MENU-02 | Product imagery | Image URLs and network available | Inspect several product cards and product detail images. | Images render or the designed fallback appears; no broken-image icon. | | | |
| MENU-03 | Categories | Menu has multiple categories | Select each category and then All Items. | Only matching products display; All Items restores the full active menu. | | | |
| MENU-04 | Search | Menu has products | Search for a full and partial product name; clear the query. | Matching items display; no-match state and clear action work. | | | |
| MENU-05 | Availability | Isolated test fixtures include each availability state | Open an AVAILABLE, SOLD_OUT, and COMING_SOON item. | Available item can be selected; unavailable items cannot be added. | | | |
| MENU-06 | Archived product | Isolated archived fixture exists | Open customer menu and search for archived product. | Archived product is absent from the customer menu and cannot be ordered. | | | |
| MENU-07 | Price source | Test product has known API price | Compare Regular/Large API prices with product card, details, cart, and checkout display. | Displayed amounts match current backend menu prices. | | | |
| CART-01 | Add and size selection | An AVAILABLE product exists | Select a product, choose Regular then Large, add each size. | Correct sizes/items appear in cart; sizes are separate line items. | | | |
| CART-02 | Quantity and total | Cart has an item | Increase quantity, decrease quantity, and inspect total after each action. | Quantity and total update; decrement cannot go below one. | | | |
| CART-03 | Remove and empty state | Cart has an item | Remove the item. | Item is removed and the empty-cart state appears. | | | |
| CART-04 | Persistence | Cart has an item | Refresh the page and navigate away/back. | Cart contents and quantities persist for the browser. | | | |
| CART-05 | Invalid quantity | Test browser tools available | Attempt to seed malformed/zero/negative/non-integer/over-limit cart data in an isolated browser profile. | Invalid entries are discarded or bounded; no invalid order can be submitted. | | | |
| CART-06 | Stale/unavailable product | Isolated fixture can be changed between requests | Add item, mark product unavailable, revisit cart/checkout. | Cart identifies unavailable item and blocks checkout until corrected. | | | |
| CHECK-01 | Checkout validation | Isolated test database; cart has available product | Submit name shorter than two characters and malformed optional phone. | Validation error appears; no request creates an order. | | | |
| CHECK-02 | Optional phone | Isolated test database | Submit valid name with blank phone. | Order can be created without phone; backend-calculated total is used. | | | |
| CHECK-03 | Empty cart | Cart is empty | Navigate directly to checkout. | Checkout redirects to cart; no order is created. | | | |
| CHECK-04 | Order creation | Isolated test database and available fixture | Submit checkout once; inspect payment route and backend record. | One order is created with an order number and server-calculated total; browser moves to payment. | | | |
| CHECK-05 | Idempotent retry | Isolated test database | Simulate a safe retry of the same checkout submission/idempotency key. | Existing order is returned; duplicate order is not created. | | | |
| PAY-01 | Demo configuration | Isolated development environment with demo enabled | Open a pending test order's payment page. | Demo mode is clearly disclosed; no real payment or UPI transfer occurs. | | | |
| PAY-02 | Demo completion | Isolated development environment | Use the demo payment action once. | Payment is marked PAID with source DEMO; customer reaches tracking. | | | |
| PAY-03 | Revenue distinction | Isolated test database with demo order | Review Dashboard revenue cards. | Demo total is separate and excluded from verified manual-UPI revenue. | | | |
| PAY-04 | Production demo denial | Production-like isolated environment, no production data | Set `NODE_ENV=production`; submit a demo-payment request for a test-only order. | Endpoint denies/not-found; payment remains unchanged. | | | |
| TRACK-01 | Tracking credentials | Isolated test order and its returned tracking token | Open tracking with valid token; then try a missing and invalid token in a clean browser context. | Valid token reads only its order; missing/invalid access is denied without private data. | | | |
| TRACK-02 | Status display | Isolated test order | Observe PLACED, PREPARING, READY, and COMPLETED states. | Correct progress step and status text are shown for each state. | | | |
| TRACK-03 | Automatic refresh | Isolated order and separate admin window | Change status in admin while customer tracking stays open. | Customer page updates without reload, normally within a few seconds. | | | |
| TRACK-04 | Terminal and cleanup | Isolated test order | Complete/cancel order; then navigate away from tracking. | Polling stops at terminal state and timers/listeners are cleaned up on navigation. | | | |
| TRACK-05 | Network failure | Browser devtools/network throttling | Briefly block API, then restore it. | Last loaded order remains visible with an error/retry indication; polling resumes. | | | |
| AUTH-01 | Admin login | Isolated test credentials configured | Sign in with valid credentials, then separately try invalid credentials. | Valid login opens admin; invalid login is rejected; password is never exposed in logs. | | | |
| AUTH-02 | Protected page/API | Signed-out browser | Open `/admin` and call admin dashboard API without a session. | UI redirects/blocks; API returns 401. | | | |
| AUTH-03 | Logout and expiration | Isolated admin session | Log out; then repeat with an expired test session. | Cookie/session is invalidated on logout; expired session is rejected. | | | |
| AUTH-04 | Unauthorized mutations | Signed-out browser | Attempt price update, order status change, payment verification, and image upload APIs. | Each admin mutation is denied with 401/403; no data changes. | | | |
| MENU-ADMIN-01 | Create/edit product | Isolated test database | Create a uniquely named fixture; edit description and prices. | Valid changes persist; invalid payloads are rejected. | | | |
| MENU-ADMIN-02 | Availability transitions | Isolated test fixture | Change AVAILABLE → SOLD_OUT → AVAILABLE → COMING_SOON → AVAILABLE. | Admin and customer menus reflect each status; unavailable order attempts are rejected. | | | |
| MENU-ADMIN-03 | Image upload | Isolated test bucket and safe image file | Upload a valid image; then try an oversized, unsupported, or invalid-signature file. | Valid image appears; invalid files are rejected; service-role key remains server-only. | | | |
| MENU-ADMIN-04 | Archive/restore | Isolated test product | Archive then restore the fixture. | Archived product disappears from customer menu and can be restored by admin. | | | |
| MENU-ADMIN-05 | Cleanup | Isolated test database/storage | Remove only the uniquely identified test fixture using the approved test cleanup workflow. | Test-only product/object is cleaned; restaurant data is untouched. | | | |
| ORDER-01 | New order visibility | Two browser windows; isolated test order | Place a customer test order and leave Admin Orders open. | Order appears automatically in New Orders and All Orders. | | | |
| ORDER-02 | Details and preparation | New test order, permitted payment state | Open details; verify customer/items/size/quantity/total; start preparation. | Details match order; status moves to PREPARING; customer view updates. | | | |
| ORDER-03 | Ready/completed | Test order in PREPARING | Move to READY then COMPLETED. | Correct tabs/counts update; All retains order; customer sees both updates. | | | |
| ORDER-04 | Invalid transition | Isolated order | Attempt skipped/backward status transitions through API/UI. | Backend rejects transition; stored order status remains unchanged. | | | |
| ORDER-05 | Payment gating | Isolated unpaid manual-claim order | Attempt to start preparation without verified payment. | Preparation is blocked; customer cannot verify their own payment. | | | |
| ORDER-06 | Pagination/filter | Isolated fixtures exceed page size | Navigate pages, change status filters, and transition an order while page is open. | Counts use global data, filters/pagination remain usable, empty page is handled. | | | |
| DASH-01 | Dashboard metrics | Isolated fixtures with expected known totals | Compare all-order, today/status counts, verified revenue, and demo revenue to database queries. | All-time count includes historical/completed/cancelled orders; daily counts use restaurant timezone; revenue separates correctly. | | | |
| DASH-02 | Dashboard refresh | Two browser windows; isolated fixture | Change order/create test order while dashboard remains open. | Statistics update automatically without duplicate network polling. | | | |
| SEC-01 | Invalid inputs | Isolated environment | Submit malformed order, payment claim, status, menu, and image payloads. | Requests are rejected with appropriate 4xx responses and no unexpected changes. | | | |
| SEC-02 | CORS and headers | Test deployment URLs | Send browser requests from approved and unapproved origins; inspect response headers. | Only configured origins receive CORS permission; security headers are present; production HSTS appears over HTTPS. | | | |
| SEC-03 | Database/storage policy | Supabase project administrator | Run the read-only grant/RLS/bucket queries in `README.md`; review provider console policies. | Backend credentials are least-privilege; storage writes are backend-mediated; policies match intended public image reads. | | | |
| MOBILE-01 | 390 × 844 | Mobile Chromium or physical device | Check menu, product details, cart controls, checkout form, payment, and tracking. | No horizontal overflow; buttons are usable; text/content do not overlap. | | | |
| MOBILE-02 | 375 × 667 | Mobile Chromium or physical device | Repeat representative customer screens and admin login/orders/menu pages. | Navigation and forms remain accessible; no clipped or overlapping controls. | | | |
| E2E-01 | Customer-to-admin workflow | Isolated database; demo enabled; two browser windows | Customer places order → admin sees New → PREPARING → READY → COMPLETED; customer tracking stays open. | Both windows show correct current state, counts/tabs update, and test records can be safely cleaned. | | | |
