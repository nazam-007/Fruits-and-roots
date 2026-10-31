# Fruits & Roots

Fruits & Roots is a restaurant QR-ordering application with a customer menu and ordering flow, counter pickup, payment and order tracking, and an authenticated admin area for managing orders and menu products.

## Features

- Browse the menu, view product sizes and prices, and add items to a persistent cart.
- Create pickup orders and continue to a separate payment page.
- View order status using the customer order-tracking page.
- Support demo payment in development and manual UPI payment claims for staff verification.
- Protect admin pages and APIs with an expiring, HTTP-only session cookie.
- Manage product descriptions, categories, prices, availability, featured status, images, and archival from the admin menu page.
- Validate current product availability and prices on the backend when preparing order quotes and creating orders.

## Technology

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router
- **Backend:** Node.js, Express, TypeScript, Zod
- **Database:** PostgreSQL (the current setup uses Supabase)
- **Image storage:** Supabase Storage (optional; requires server-side configuration)

## Prerequisites

- Node.js 18 or later and npm
- A PostgreSQL database with the application schema
- Supabase project credentials if using Supabase PostgreSQL or Storage

The frontend and backend have separate dependencies and are run from their respective folders.

## Set up the backend

In PowerShell, from the project root:

```powershell
Copy-Item backend\.env.example backend\.env
```

Edit `backend\.env` and configure the required values:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Use `development` locally; set to `production` when deployed. |
| `DEMO_PAYMENTS_ENABLED` | Set to `true` only to enable the development demo-payment flow. |
| `PORT` | Backend HTTP port; defaults to `5000`. |
| `FRONTEND_ORIGIN` | Exact allowed frontend origin(s), comma-separated; local default is `http://localhost:5173`. Production requires HTTPS origins. |
| `DATABASE_URL` | PostgreSQL connection string. Keep it on the backend only. |
| `MERCHANT_UPI_ID` | Merchant UPI ID used to display payment instructions. |
| `MERCHANT_UPI_NAME` | Merchant display name for payment instructions. |
| `ORDER_TRACKING_SECRET` | Long, random secret used to protect order-tracking access. |
| `ADMIN_USERNAME` | Admin login username. |
| `ADMIN_PASSWORD_HASH` | Scrypt password hash; generate it as described below. Passwords may be 6–128 characters; use a long unique passphrase. |
| `SUPABASE_URL` | Supabase project URL for optional image uploads. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key for optional uploads. **Backend only; never add it to frontend variables or source code.** |
| `MENU_STORAGE_BUCKET` | Storage bucket name; defaults to `menu-images`. |
| `TRUSTED_PROXY_IPS` | Optional comma-separated proxy IP addresses/CIDRs. Leave unset unless requests arrive through trusted proxies that overwrite forwarded-for headers. |

Generate the admin password hash by running this in an interactive terminal:

```powershell
Set-Location backend
npm install
npm run admin:hash-password
```

Enter an admin password between 6 and 128 characters when prompted; a long, unique passphrase is recommended. Copy the printed `ADMIN_PASSWORD_HASH` value into `backend\.env`; do not put the plain-text password or hash in frontend code, logs, or source control. Existing valid scrypt hashes remain compatible.

Install dependencies and start the backend:

```powershell
Set-Location backend
npm install
npm run dev
```

The API listens on `http://localhost:5000` by default. `npm run build` compiles the backend, and `npm start` starts the compiled server.

### Database migrations

The SQL migrations are in `backend/migrations/` and must be applied to the target PostgreSQL database in numeric order:

1. `001_order_idempotency_tracking.sql`
2. `002_counter_pickup_orders.sql`
3. `003_demo_payments_and_order_numbers.sql`
4. `004_order_creation_schema_repair.sql`
5. `005_admin_dashboard.sql`
6. `006_menu_management.sql`

Apply migrations only if they have not already been applied to that database. Use a database migration workflow or the Supabase SQL Editor, and verify the result before deploying the application. Do not run migrations against production without a backup and review.

### Optional product image uploads

To enable image uploads:

1. In the Supabase Dashboard, open **Storage** and create a **public** bucket named `menu-images` (or set `MENU_STORAGE_BUCKET` to a different bucket name).
2. Set the bucket's file size limit to 4 MB and allowed MIME types to `image/jpeg`, `image/png`, and `image/webp`.
3. In `backend\.env`, set `SUPABASE_URL` to the Project URL from **Project Settings → API**, and set `SUPABASE_SERVICE_ROLE_KEY` to the server-side service-role key from the same settings page. Keep this key only in the backend environment; never use it in frontend configuration or commit it.
4. Restart the backend after changing its environment.

If storage is not configured, product editing and availability management still work, but image uploads return a configuration error that identifies which backend setting is missing.

## Set up the frontend

Open a second PowerShell terminal from the project root:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

The frontend uses `http://localhost:5000` as its default API URL. To use a different backend, create `frontend\.env.local` with:

```dotenv
VITE_API_URL=http://localhost:5000
```

Only public configuration belongs in `VITE_*` variables. Never store database credentials, admin secrets, or Supabase service-role keys in frontend environment files.

## Customer routes

| Route | Purpose |
| --- | --- |
| `/` | Home page |
| `/menu` | Browse and search menu items |
| `/product/:id` | Product details, sizes, and quantity |
| `/cart` | Review cart |
| `/checkout` | Enter customer details and create an order |
| `/payment/:orderId` | Continue payment for the existing order |
| `/order/:orderId` | Track an order |

## Admin routes

| Route | Purpose |
| --- | --- |
| `/admin/login` | Admin sign-in |
| `/admin` | Dashboard |
| `/admin/orders` | Order list |
| `/admin/orders/:orderId` | Order details and available staff actions |
| `/admin/menu` | Product and menu management |

Sign in at `/admin/login` using the configured admin username and password. Admin access requires the backend session and database migrations to be configured.

## API overview

- `GET /api/health` — backend health check
- `GET /api/db-health` — database connectivity check
- `GET /api/menu` — active customer menu
- `GET /api/payment-config` — customer payment configuration
- `POST /api/orders/quote` — quote current server-side prices
- `POST /api/orders` — create an order
- `GET /api/orders/:orderId` — securely retrieve order tracking data
- `GET /api/admin/*` — authenticated admin dashboard, order, authentication, and menu APIs

Admin menu writes require an authenticated admin session. The backend validates request data and checks availability and prices against PostgreSQL; customer-supplied cart prices are not authoritative.

## Development checks

Frontend:

```powershell
Set-Location frontend
npm run build
npm run lint
```

Backend:

```powershell
Set-Location backend
npm run build
```

The backend tests cover admin password hash compatibility and the extended passphrase length policy.

## Production security checklist

- [ ] Terminate HTTPS at the public ingress/load balancer and redirect HTTP to HTTPS. Express does not issue TLS certificates. Set `NODE_ENV=production`; the admin cookie uses `Secure` and Helmet enables HSTS in production.
- [ ] Set `FRONTEND_ORIGIN` to exact HTTPS frontend origin(s), comma-separated, with no paths or wildcards. Production startup rejects missing, non-HTTPS, or non-exact origins.
- [ ] Store `DATABASE_URL`, `ADMIN_PASSWORD_HASH`, `ORDER_TRACKING_SECRET`, merchant configuration, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the deployment secret manager. Rotate credentials if exposed. Keep service-role credentials exclusively on the backend.
- [ ] Use a dedicated least-privilege PostgreSQL role for the backend. Require TLS for Supabase PostgreSQL connections (for example, provider-supported `sslmode=require`) and verify permissions before deployment.
- [ ] Review Supabase Storage bucket visibility, upload size/type limits, and object policies. Public reads are needed for current public menu image URLs; writes should remain through the authenticated backend only.
- [ ] Rate limits are stored in process memory. They reset on restart and are not shared across instances; use a shared store if deploying multiple backend instances. This project does not configure an external rate-limit store.
- [ ] Express does not trust forwarded IP headers by default. If deployed behind a proxy, set `TRUSTED_PROXY_IPS` only to exact proxy IPs/CIDRs, and configure the proxy to overwrite forwarded-for headers rather than preserve untrusted client values. Do not set broad trust values such as `true`.
- [ ] Set `DEMO_PAYMENTS_ENABLED=false`. Demo payment is enabled only in development; never represent demo payments as real revenue.
- [ ] Enable provider-side access/error monitoring and alerts for repeated login failures, rate-limit responses, database errors, and storage upload failures. Avoid logging passwords, tokens, or secret values.
- [ ] Back up the database before applying schema migrations; review and apply them using the established migration workflow.
- [ ] Manual UPI payment claims require staff to independently verify receipt before marking an order paid.

The following read-only SQL can help review PostgreSQL grants and policies; review the results with a database administrator. These queries do not change schema or permissions:

```sql
SELECT current_user, session_user;

SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema IN ('public', 'storage')
ORDER BY table_schema, table_name, grantee, privilege_type;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;
```

Verify actual service role, grants, RLS policies, and Storage bucket policies in Supabase. Do not enable RLS or change privileges without reviewing application access requirements.
