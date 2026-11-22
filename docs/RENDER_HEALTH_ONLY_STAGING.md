# Render backend-only health staging

This is not the customer ordering API. The existing Render Static Site stays unchanged in browser-local demo mode. Pay at Counter remains the planned production payment method; neither orders nor payments work on this health service.

## Why a separate entry point

Normal `src/server.ts` imports `db.ts`, which loads dotenv and requires DATABASE_URL before Express starts. Normal listening also starts the legacy pending-payment expiry worker. Do not use `npm start`, `npm run dev`, `start:preview` or the Razorpay diagnostic entry for this deployment.

`src/stagingServer.ts` imports only Express, Helmet and the dependency-free shutdown helper. It does not load dotenv, pg, application routes, frontend hosting, Supabase clients, payment code or workers. It requires STAGING_HEALTH_ONLY=true and refuses nonempty application credential/database variables or enabled payment/frontend flags. No background scheduler starts. The normal production entry is unchanged.

- GET /health: 200, `{ "status": "ok" }` (HEAD also supported by Express).
- GET /ready: 503, `{ "status": "not_ready" }`; intentionally not ready for orders.
- All other paths/mutation methods: generic JSON 404; no CORS credentials, cookies, database diagnostics or frontend files.

## Proposed Render settings — do not create or deploy until approved

Create a NEW Node Web Service from `nazam-007/Fruits-and-roots`; do not edit or replace the existing Static Site. Use the reviewed commit once separately committed/pushed. Branch: main. Suggested name: fruits-and-roots-backend-staging. Root Directory: `backend`. Instance: Free if available in the account. Auto-Deploy: Off. No database, disk, cron, worker, secret file or shared secret environment group.

Build command:

```sh
npm ci --include=dev && npm run build
```

Start command (not npm start):

```sh
node dist/stagingServer.js
```

Health Check Path: `/health`, NOT `/ready`. Leave Pre-Deploy Command empty. The service binds 0.0.0.0 and uses Render's PORT. Do not set a fixed port. Render terminates public HTTPS; this mode has no database TLS connection.

Non-secret environment settings:

| Name | Value |
| --- | --- |
| NODE_ENV | production |
| NODE_VERSION | 22.x (bounded major; Render resolves the available patch) |
| STAGING_HEALTH_ONLY | true |
| RAZORPAY_MODE | off |
| DEMO_PAYMENTS_ENABLED | false |
| SERVE_FRONTEND | false |
| PORT | Render-provided; do not override |

No secrets are required. Do NOT copy backend/.env or the full application .env.example. Do not supply DATABASE_URL, Supabase, PG credentials/service settings, admin credentials, tracking secrets, merchant UPI details or gateway keys. Do not set NODE_OPTIONS to preload application/dotenv modules. Do not change the Static Site API URL or Vite settings to target this service.

Local verification used Node 22.14.0. Check Render's resolved 22.x patch in the approved build logs; do not assume it is the same patch. The bounded range avoids silently moving to a new major while permitting provider-supported patch updates.

## Local checks (no database)

From backend:

```sh
npm run build
node --import tsx --test --test-concurrency=1 src/stagingServer.test.ts src/deployment.test.ts src/databaseConfig.test.ts
```

Tests exercise only a health-only listener and existing mocked configuration tests. The compiled-entry test uses a temporary synthetic .env plus import/outbound-socket guards; it must never load database, dotenv, payment, route or worker modules. Temporary test fixtures are removed. No real application backend is started.

After an approved deployment: verify /health returns minimal JSON 200; /ready returns 503; GET /api/db-health and POST /api/orders and /api/admin/auth/login return generic JSON 404. Confirm logs contain only fixed startup messages and no database/worker activity. No customer-order smoke tests belong on this service.

## Remaining gates

Commit, push, creation and deployment each remain subject to user approval. Free services can sleep; this is acceptable for infrastructure staging and is not a real-customer availability assessment. Launching the full application later requires separate restricted-role authentication, TLS, migration/security approvals and real-database workflow verification. Switching away from this health-only entry is a separate deployment change, never an automatic fallback.

Render references: https://render.com/docs/deploy-node-express-app , https://render.com/docs/health-checks , https://render.com/docs/node-version , https://render.com/docs/free .
