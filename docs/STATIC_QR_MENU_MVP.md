# Static QR menu MVP — local preparation, 2026-11-14

No deployment, database connection, SQL, credential/configuration change, backend restart or financial-record change occurred. Existing ordering/payment entry points and prior preview mode are preserved. This static entry does not depend on the database-security packages.

## Implementation and source
Dedicated static-menu/index.html -> src/staticMenuMain.tsx -> src/StaticMenu.tsx. Reuses React/TypeScript, Lucide icons and existing index.css/Tailwind styling; separate read-only cards avoid importing cart-dependent ProductCard. Search, category anchors and responsive cards; no router, contexts, forms, images, analytics, remote fonts or payment libraries. Operational deep links render the menu only under host fallback. Header states Menu Preview — Ordering Unavailable.

src/data/static-menu.snapshot.json contains only public menu fields copied from approved-menu.manifest.json: 37 exact IDs, 4 ordered categories, 69 explicit non-null variants. No calculated Large price fallback. 34 products use the previously approved original-project snapshot; Dragon, Beetroot and ABC use approved source-menu values and are visibly marked pending database restoration with unverified availability. They were not inserted anywhere. The snapshot is historical, not a fresh database read; later admin edits are not known without separate inspection.

Approved discrepancies retained: Avocado Sandwich Regular 90/Large 170 rupees; Aalu Cheese Burger Regular 110, no Large, AVAILABLE. Dragon 169/328, Beetroot 59/108, ABC 99/188 rupees. Turkish Tea and Filter Coffee have no variants/prices and remain COMING_SOON; display Price not listed rather than inventing prices. Four separate Banana Shake records remain excluded; no original record was changed. Category counts: 25/4/5/3.

## Images
Text-only by design. All 37 image slots are omitted rather than contacting Storage/Unsplash or inventing photos. Existing review identified nine gaps in fallback mappings (Date, Watermelon, Lassi, Fruit Date Delight, Single Choco Waffle, Fruit Choco Waffle, Dragon, Beetroot, ABC); the other 28 remote fallbacks remain unverified and are not bundled or requested. Original 34 matched records had no stored image_url in the approved inspection. Images are optional future work, not a text-only launch blocker.

## Build isolation
vite.static.config.ts uses a separate root/output, envDir=false, envPrefix=[], publicDir=false, no source maps and no normal App import. Only the compiled public snapshot, React/UI code and CSS ship. Local .env files, backend, recovery journals, private project metadata and API/gateway clients are not copied. No deployment environment variables are required. Build artifacts are ignored in Git. Do not deploy normal frontend/dist by mistake.

HTML CSP and netlify.static.toml headers prohibit connect-src; no fetch/XHR/EventSource/WebSocket implementation in the static app. Only same-origin document/JS/CSS requests occur. Security headers are a second boundary; no database client exists to depend on them. Hosting providers may insert analytics/injections: keep those disabled and repeat the network smoke check on the final site.

## Verification
From frontend:
- npm run build:static — TypeScript and static production build passed.
- npm run lint — passed.
- npm run build — existing normal application production build passed; no normal app routes changed.
- npm run test:static — 14 production-build Playwright tests passed, 0 failed. Snapshot field/variant parity, 37/69 inventory, bundle service/credential-pattern exclusion, six root/operational paths with no API/third-party requests, six widths 320/375/390/430/768/1024, search and price display. Tests verify actual styling as well as layout. Artifacts use unique OS-temp output directories and one worker; runs are sequential.
- Mobile screenshot visually reviewed. Initial missing Tailwind utility discovery was corrected with staticMenu.css explicit @source. Initial null-price variant issue was corrected; no null-price variants published.

Rebuild before testing; tests serve the existing dist-static production artifact, not Vite dev or Express. Normal ordering/payment behavior was preserved in code; no live payment or database integration test was run.

## Simple local preview
Run npm run build:static, then:
node node_modules/vite/bin/vite.js preview --config vite.static.config.ts --host 127.0.0.1 --port 5189 --strictPort
Open http://127.0.0.1:5189. This starts only a static file server; no backend. Stop with Ctrl+C. No service was left running by automated tests.

## Deployment proposal — requires separate public deployment approval
Netlify offers a Free plan subject to usage limits: https://www.netlify.com/pricing/ . netlify.static.toml is preparation only (explicit selection required). With repo root as base, build command is npm --prefix frontend ci && npm --prefix frontend run build:static; publish frontend/dist-static. SPA fallback handles all deep links, and static security headers block connections/framing/forms. No functions or server, no Supabase/API/Razorpay/admin credentials. Do not enable automatic deployment before approval; no Git push is authorized.

After explicit approval, manually create/select the intended static site and review build/publish settings. For a manual artifact upload, upload ONLY frontend/dist-static; configure equivalent SPA fallback/security headers in the host (select netlify.static.toml explicitly for repository builds). Keep tracking/analytics and third-party script injection off. Verify HTTPS, all menu values, root/deep-link behavior and zero API requests on the published URL before printing a permanent QR. Final public URL and public deployment need owner approval; QR generation waits for the final URL.

## Remaining owner decisions
Review the static visual/menu snapshot and three pending-restoration badges; accept text-only launch, unlisted tea/coffee prices and snapshot availability disclaimer; choose final hosting/site URL; approve public deployment. No database remediation, migration 016, menu import, live payment configuration or third project is necessary for this static MVP. Database security issues remain outstanding for future connected ordering and are not fixed by this change.

## Superseded launch priority
The full application is the deployment goal. This static experiment remains optional. Configuration is now netlify.static.toml (explicit selection only), not root netlify.toml. See FULL_APPLICATION_DEPLOYMENT_PLAN.md.
