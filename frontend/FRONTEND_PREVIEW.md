# Frontend-only Render preview

Set `VITE_PREVIEW_MODE=true` before `npm run build`. This build uses four local illustrative sample products and a bundled SVG, not the database menu or saved customer data. Preview takes precedence over the older `VITE_MENU_PREVIEW` experiment. Production output is `frontend/dist`; the normal full application is excluded from this preview bundle. No backend, operational contexts, API clients, payment scripts or authentication pages are mounted. All operational/unknown URLs show an unavailable message. A preview-only HTML CSP prohibits API connections, frames and form submissions. Do not add analytics, third-party scripts, external images or service workers.

`VITE_PREVIEW_MODE=false` (or unset) preserves the existing application/explicit menu-preview mode. The new preview CSP and sample UI are not enabled in normal builds. The preview flag is public build configuration, never an authorization mechanism for a deployed backend.

After separate Git/public-deployment approval, Render Static Site settings:

- Repository: `nazam-007/Fruits-and-roots`; root directory: `frontend`.
- Build command: `npm ci --include=dev && npm run build`.
- Publish directory: `dist` (no start command, Express service or database required).
- Build environment: `VITE_PREVIEW_MODE=true`; choose a supported Node version compatible with Vite (local validation uses Node 22.14.0). No backend secrets, database URL, merchant details, payment keys or API URL are needed.
- Rewrite: source `/*`, destination `/index.html`, action **Rewrite**, so menu/product deep links load the preview.
- Keep auto-deploy disabled until explicitly approved. A flag change requires rebuilding; it is not a runtime toggle.

Verification: `npm run test:frontend-preview` builds the production preview then tests asset isolation, zero API/third-party requests, direct operational URLs, images, search/categories, product details and mobile/desktop widths with one browser worker. `npm run lint` and `npm run test:deployment` cover frontend static quality and existing API URL normalization. These checks do not test full-app database/payment behavior. Render's final deployed rewrite, CSP and network behavior still require a separately approved public smoke test.
