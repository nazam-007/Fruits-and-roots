# Menu preview implementation and security proposals — NOT DEPLOYED

Target original project mrjsfznxbwjsdzyuzvsi only; testing project stays separate.
No SQL, migrations, permission changes, credential provisioning or deployment ran.
These proposals supersede neither the prior staging-only import nor its guards.

## Dependencies and approval order
1. Confirm backup/recovery access, exact target and change window. Snapshot grants
   and policy definitions for reviewed rollback; never restore broad grants blindly.
2. Review direct Supabase clients/GraphQL/external consumers. Repository customer
   menu uses Express; admin Storage uses backend service-role credentials. Revoking
   table grants does not revoke Storage permissions. External users are unverified.
3. Separately approve proposed_client_isolation.sql. Removes PUBLIC/anon/authenticated
   table AND column grants on seven inspected relations, enables RLS, forces session
   RLS, refuses inherited access remaining. Preserves records and postgres access.
   Existing postgres is BYPASSRLS; FORCE does not constrain it. Session security
   still needs actual anonymous/authenticated Data API denial checks after approval.
4. Separately approve proposed_preview_role.sql. LOGIN initially has no password;
   provision a unique password privately with psql \password, separately approved.
   SELECT only three menu tables, no sequence access or financial/session grants.
   Read-only defaults are defense in depth, not irrevocable authorization: grants
   are the boundary. Review effective inherited PUBLIC grants before deployment.
5. Verify role flags/grants and negative write checks in isolated tests. Do NOT
   issue a write probe against the original database. Review SQL statically first.
6. Approve Render secret/config setup and deployment separately. Never run current
   npm start against original records for preview: it starts the expiry worker.

## Implementation
backend start:preview runs dist/startMenuPreview.js, never loads dotenv or the normal
server. It pins original direct endpoint or verified region session pooler plus
project-qualified role, query-free database URL, postgres database, verify-full TLS
and HTTPS exact FRONTEND_ORIGIN. Each connection sets read-only; startup checks TLS
socket, actual role and elevated flags. Only GET /api/menu and GET /api/health are
mounted; other methods return 405, other paths 404. No body parser, operational
routes, payment configuration or expiry worker. SELECT parameterized allowlist
matches 37 manifest IDs; defense-in-depth response filter, archived predicate,
all available=false. Prices remain stored prices, absent three products stay absent.
Categories render in approved display order without modifying database sorting.
No settings/tags queries are needed for this minimal preview.

Frontend VITE_MENU_PREVIEW=true selects a separate lazy entry at build time, without
normal App/cart/checkout/admin contexts or routes. Any deep link shows only preview.
It fetches only GET /api/menu, shows required notice and prices, no order controls.
Initial minimal preview is text-only: no image network calls or unreviewed assets.
No changes to normal routes or the running environment. VITE_API_URL must be the
HTTPS preview API origin. Preview must use its matching restricted backend; the
frontend flag alone is not a security boundary. Do not use integration runner or
its approvals against original project; it deliberately excludes this project.

## Render and TLS plan (manual approval required)
Frontend static site root frontend, npm ci && npm run build, publish dist, SPA rewrite.
Backend web service root backend, npm ci && npm run build, npm run start:preview,
health /api/health. Pin supported Node version matching validated builds. Set
NODE_ENV=production, DATABASE_TLS_MODE=verify-full, DATABASE_URL (preview role only),
DATABASE_CA_CERT_PATH (Render-mounted trusted CA if required), FRONTEND_ORIGIN.
Do not supply Razorpay keys, Storage service-role keys or admin credentials.
No auto-deploy until reviewed. Read-only health means process health, not database readiness.
On Render verify actual socket authorized and certificate/hostname negative tests
on a safe environment. Direct certificate-validating Postgres avoids the observed
plaintext pooler upstream hop, if Render networking supports it. Otherwise obtain
provider evidence/enforcement of upstream encryption; do not claim end-to-end TLS.

## Storage and remaining scope
Images intentionally omitted pending approved validation: public menu-only bucket,
public read limited to intended assets, no anonymous uploads/deletes, backend-only
service credentials, file type/size controls, URLs load and contain no signed tokens.
Three missing products need separate insert-only SQL approval; no restoration here.
Nine image gaps and Banana Shake decisions remain. Migration 016 is unnecessary.
Broader production payment/authentication integration remains blocked.

## Recovery
Before SQL COMMIT failure rolls back table/grant/role changes transactionally. After
commit review captured grants/policies and dependencies for a corrective proposal;
never auto-regrant client session access. Keep preview offline if security checks
fail. No role drops, product deletions, financial cleanup or credential changes are
authorized here. Existing normal app stays unchanged until explicit rollout approval.

## Verification performed locally
- Existing backend database-free suite: 133 passed, 0 failed.
- Preview backend suite: 4 passed, 0 failed; exact manifest, blocked methods/paths,
  parameterized allowlist, response filtering and sanitized failures.
- Mocked browser preview: 1 passed, 0 failed; checkout/payment/admin deep links
  render preview only, no controls, GET menu only, no overflow at 320px.
- Backend TypeScript build, normal frontend build and lint passed.
- Preview frontend production build verified separately. No real DB role/policy,
  SQL proposal execution or deployed TLS/Storage verification is claimed.

Additional approval prerequisite: audit inherited PUBLIC function EXECUTE grants,
SECURITY DEFINER functions and default privileges. The reviewed inspection did not
cover them; table privilege checks alone cannot certify all database capabilities.
Preview SQL does not revoke platform function permissions automatically. No public
API key or preview database credential is exposed to frontend clients.
