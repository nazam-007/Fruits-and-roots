# Fruits & Roots — Project-Wide AI Agent Instructions

## 1. Project Identity

Project: Fruits & Roots

Application: Restaurant digital menu, customer ordering, order tracking, and administration system.

Primary goal: Deliver a secure, responsive, reliable, and maintainable restaurant ordering platform that works smoothly for customers and restaurant staff.

These instructions apply to the entire repository and all AI-assisted development tasks.

All coding agents must read this file before inspecting, modifying, generating, or deleting project files.

## 2. Technology Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Existing React Context and state management

### Backend
- Node.js
- Express.js
- TypeScript
- REST APIs

### Database and Storage
- Supabase PostgreSQL
- Supabase Storage for menu product images

### Development and Quality
- Git and GitHub
- VS Code
- npm and existing package scripts
- Existing unit and integration tests
- Playwright for browser testing where configured

Do not replace the existing technology stack or introduce major dependencies without approval.

## 3. Project Structure

Expected main directories:

- frontend/ — Customer and admin interfaces
- backend/ — API, business logic, authentication, and database access
- docs/ — Documentation and testing reports
- README.md — Project setup and overview
- AGENTS.md — Project-wide agent instructions

Inspect the actual repository structure before making assumptions.

Do not unnecessarily reorganize directories.

## 4. Mandatory Pre-Change Inspection

Before every implementation:

1. Read AGENTS.md.
2. Run `git status --short`.
3. Check the current branch.
4. Inspect existing uncommitted changes.
5. Identify the files relevant to the requested task.
6. Read the current implementation.
7. Check whether the requested functionality already exists.
8. Identify dependencies and potential regressions.
9. Plan the smallest safe change.

Do not start coding without understanding the existing implementation.

If the working tree contains ambiguous changes affecting the requested files, ask before modifying them.

## 5. Git and Merge Conflict Prevention

This project has experienced frequent merge conflicts during AI-assisted development.

Follow these rules strictly:

- Make small, focused, incremental edits.
- Preserve all existing user changes.
- Avoid replacing complete files.
- Avoid unrelated formatting changes.
- Do not reorder imports unnecessarily.
- Do not refactor unrelated code.
- Do not overwrite changes made by another agent.
- Do not create duplicate implementations.
- Do not modify generated files unnecessarily.
- Avoid unnecessary package-lock.json changes.
- Review the diff after editing.
- Keep independent features in separate logical changes.

Never automatically execute:

- git reset --hard
- git clean -fd
- git restore .
- git checkout -- .
- git push --force
- git merge
- git rebase
- git pull
- git commit
- git push

Do not switch branches without approval.

Do not automatically resolve merge conflicts by accepting an entire incoming or current file.

If conflicts exist:

1. Identify affected files.
2. Inspect both versions.
3. Explain the conflicting changes.
4. Preserve compatible functionality from both sides.
5. Ask for approval when resolution is ambiguous.

Never delete conflict markers without reviewing the intended behavior.

A clean Git diff does not guarantee that future merges will be conflict-free.

## 6. Scope and Change Management

Implement only the feature requested by the user.

Do not:

- Add unrelated features.
- Redesign unrelated screens.
- Rewrite working components.
- Change database schema without approval.
- Change payment behavior without approval.
- Modify authentication unnecessarily.
- Introduce new architecture without justification.
- Deploy without explicit authorization.

Prefer existing components, services, hooks, types, routes, and utilities.

If the task requires changes outside the requested scope, explain the dependency first.

## 7. Customer Application

The customer-facing application includes or is intended to support:

- Public digital menu
- Product categories
- Product details
- Product images
- Product size variants
- Availability indicators
- Shopping cart
- Checkout
- Order placement
- Payment flow
- Order tracking
- Order cancellation, when implemented

Before modifying any feature, verify its current implementation.

### Menu

- Load products from the existing backend.
- Respect availability flags.
- Handle missing images gracefully.
- Preserve category filtering.
- Preserve existing product variants and pricing.
- Do not expose unavailable products as orderable.
- Never trust frontend prices as authoritative.

### Cart

- Preserve selected products, quantities, and variants.
- Validate quantities.
- Prevent invalid or unavailable items from being ordered.
- Keep totals consistent with backend validation.
- Avoid losing cart state during normal navigation.
- Do not introduce duplicate cart contexts or stores.

### Checkout

- Preserve the current customer information requirements.
- Customer name is required where currently enforced.
- Phone number remains optional unless requirements change.
- Validate required fields.
- Prevent duplicate order submission.
- Display meaningful errors.
- Preserve the existing checkout flow.

### Order Type

Counter Pickup is the current Phase 1 workflow.

Dine-in and optional table number support may be introduced in a separate approved task.

Do not assume these features or their database migrations already exist.

Do not automatically implement table QR ordering.

## 8. Customer Order Tracking

The customer should be able to track an order without manually refreshing the page.

Supported order states must be determined from the actual backend implementation.

Expected core lifecycle:

PLACED → PREPARING → READY → COMPLETED

CANCELLED is a separate terminal state where supported.

Requirements:

- Display accurate backend status.
- Update status automatically.
- Avoid unnecessary page reloads.
- Preserve last valid data during temporary network errors.
- Clean up polling intervals and subscriptions.
- Prevent stale responses from overwriting newer data.
- Do not expose other customers' orders.
- Use secure order-specific tracking authorization.

Prefer an existing supported real-time mechanism.

SSE may be used when the backend and deployment environment support it.

Otherwise, use the approved polling strategy.

Do not implement 500ms polling without explicit approval.

Do not introduce WebSockets or additional infrastructure without justification.

## 9. Customer Order Cancellation

Customer cancellation is a planned or existing feature depending on repository state.

Verify implementation before changing it.

Recommended business rules:

- Customers may cancel only while the order is PLACED.
- PREPARING, READY, COMPLETED, and CANCELLED orders cannot be cancelled by customers.
- The backend must enforce authorization and state validation.
- Cancellation must use a transaction-safe or atomic conditional update.
- Prevent cancellation and preparation from both succeeding in a race.
- Require confirmation in the customer UI.
- Never treat cancellation as proof of a refund.
- Preserve payment transaction records.

Do not introduce automatic refunds without approval.

## 10. Admin Application

The admin application manages restaurant operations.

Existing or expected modules include:

- Admin authentication
- Dashboard
- Menu management
- Product availability
- Product image uploads
- Order management
- Order details
- Payment verification
- Order status updates

Preserve all working admin features.

### Admin Dashboard

Dashboard statistics must come from actual backend data.

Expected metrics, where supported:

- All Orders
- Orders Today
- New Orders
- Preparing Orders
- Ready Orders
- Completed Orders
- Cancelled Orders
- Verified Revenue
- Demo Payment Totals

All Orders means the total historical order count across statuses.

Do not derive the historical total from a paginated list or today's orders.

Never display demo payment totals as verified revenue.

### Admin Orders

- New Orders should be the default tab when no explicit tab is selected.
- Preserve explicitly selected tabs.
- Keep All Orders accessible.
- Preserve filters, pagination, and search where supported.
- Show accurate order counts.
- Keep order lists synchronized with backend state.

After successfully completing an order:

- Navigate back to Admin Orders.
- Select New Orders.
- Refresh the order list and counts.
- Do not redirect if the backend update fails.

After successful admin cancellation, follow the approved navigation behavior.

Opening an already completed order must not trigger automatic redirection.

### Admin Polling

Expected admin dashboard and orders polling interval: 2000 milliseconds.

Requirements:

- Refresh visible order data automatically.
- Refresh all status counts.
- Avoid duplicate timers.
- Avoid overlapping requests.
- Pause unnecessary polling while the document is hidden.
- Refresh immediately when visibility resumes.
- Clean up on unmount.
- Preserve the selected tab.
- Avoid loading flicker.
- Keep manual Refresh functional.

Do not introduce one timer per dashboard card when a coordinated fetch is available.

## 11. Order Status Management

Use the existing backend status-transition rules as the source of truth.

Expected primary progression:

PLACED → PREPARING → READY → COMPLETED

Cancellation is a separate transition with role-specific restrictions.

Requirements:

- Validate all transitions on the backend.
- Prevent invalid transitions.
- Prevent duplicate status mutations.
- Use safe database updates.
- Return clear errors for conflicts.
- Keep customer and admin views synchronized.
- Never infer successful updates before backend confirmation.

Do not silently change the lifecycle.

## 12. Payment Management

The project currently uses or has used demo payment functionality.

Real payment gateway integration is a separate future task unless explicitly approved.

Rules:

- Never confuse demo payments with real payments.
- Never count demo payments as verified revenue.
- Keep demo payment functionality disabled in production unless explicitly authorized for a controlled nonfinancial environment.
- Never mark an order as genuinely paid based only on a frontend response.
- Verify payment state through trusted backend mechanisms.
- Never expose payment secrets to the frontend.
- Never automatically refund a payment because an order was cancelled.
- Preserve transaction history.
- Avoid duplicate payment processing.
- Do not implement a paid gateway without approval.

For future real payment integration, require server-side verification, idempotency, and appropriate webhook security.

## 13. Backend API Standards

Follow the existing Express and TypeScript conventions.

- Keep routes focused.
- Validate request inputs.
- Use appropriate HTTP status codes.
- Use consistent error responses.
- Do not leak internal errors.
- Enforce authorization on protected endpoints.
- Keep database queries parameterized.
- Use atomic updates or transactions where necessary.
- Avoid unnecessary database queries.
- Preserve API compatibility.
- Do not introduce breaking response changes without approval.

Do not trust frontend-provided prices, totals, payment status, or administrative privileges.

## 14. Database Rules

Database: Supabase PostgreSQL.

- Inspect the existing schema before writing queries.
- Do not assume columns or tables exist.
- Use migrations for approved schema changes.
- Do not execute migrations automatically.
- Do not delete or truncate shared data.
- Do not modify production data during testing.
- Preserve foreign keys and constraints.
- Prefer efficient database aggregation for dashboard statistics.
- Consider concurrency for order transitions.
- Avoid introducing unnecessary tables or columns.

If a migration is required, generate it for review and explain its impact.

## 15. Supabase Storage

Product images are stored using Supabase Storage.

Requirements:

- Keep service-role credentials backend-only.
- Validate file type and size.
- Preserve existing image URLs.
- Avoid orphaning files unnecessarily.
- Respect bucket permissions.
- Do not make sensitive storage resources public.
- Handle failed uploads gracefully.
- Do not delete existing product images without approval.

## 16. Authentication and Security

Security is mandatory across customer and admin functionality.

- Preserve admin authentication.
- Preserve password hashing.
- Never store plaintext admin passwords.
- Never expose Supabase service-role keys in the frontend.
- Never commit real secrets.
- Never log credentials or tracking tokens.
- Protect admin routes.
- Validate user input.
- Preserve rate limiting and security headers.
- Maintain appropriate CORS configuration.
- Avoid exposing private customer information.
- Use least-privilege access wherever possible.

Do not disable security controls merely to make a feature work.

## 17. Environment Variables

Use environment variables for secrets and deployment configuration.

- Commit only safe example files such as `.env.example`.
- Never commit real `.env` files.
- Never hardcode passwords, tokens, database URLs, or private keys.
- Never expose backend secrets through Vite frontend variables.
- Update `.env.example` when introducing approved configuration.
- Document new environment variables.
- Use secure production values.
- Do not print actual secret values in reports.

## 18. Frontend Engineering Standards

Follow existing React and TypeScript patterns.

- Prefer reusable components.
- Keep components focused.
- Avoid duplicated business logic.
- Use existing hooks and contexts.
- Keep state consistent.
- Handle loading, empty, error, and success states.
- Prevent unnecessary rerenders.
- Clean up effects, timers, and subscriptions.
- Avoid memory leaks.
- Preserve accessible controls.
- Use semantic HTML.
- Keep API calls in the appropriate service layer.
- Do not introduce unnecessary global state.

Avoid unnecessary changes to existing architecture.

## 19. Responsive Design

All customer and admin pages must support mobile and desktop.

Important viewport widths:

- 320px
- 360px
- 375px
- 390px
- 414px
- 430px
- 768px
- 1024px
- 1440px

Requirements:

- No unintended horizontal page scrolling.
- No clipped buttons or inputs.
- No overlapping content.
- Responsive cards and tables.
- Readable text.
- Accessible tap targets.
- Correct modal and dropdown behavior.
- Preserve desktop functionality.

Find the actual cause of overflow.

Do not use blanket `overflow-x: hidden` as a substitute for fixing layout problems.

## 20. Testing Requirements

Run relevant tests after every implementation.

Depending on the changed area:

- TypeScript checks
- Frontend build
- Backend build
- Unit tests
- API tests
- Security tests
- Playwright browser tests
- Responsive tests

Test successful behavior and failure cases.

For order management, consider:

- Order creation
- Status transitions
- Invalid transitions
- Cancellation
- Polling and live updates
- Duplicate requests
- Authorization
- Payment-state preservation

Do not claim full end-to-end verification when only mocked tests have passed.

Do not use shared production restaurant data for automated tests.

If tests cannot be executed, report the limitation.

## 21. Performance and Reliability

- Avoid redundant API requests.
- Avoid overlapping polling requests.
- Avoid excessive database queries.
- Preserve cached or existing data during background refresh.
- Prevent stale responses.
- Use efficient pagination and filtering.
- Avoid unnecessary React rerenders.
- Handle temporary network failures.
- Clean up resources.
- Keep the UI responsive during asynchronous operations.

Optimize only where necessary and measurable.

## 22. Logging and Error Handling

- Provide useful errors without leaking secrets.
- Keep server logs actionable.
- Avoid excessive logging in polling loops.
- Do not log sensitive customer information.
- Handle network failures gracefully.
- Use appropriate error states.
- Do not silently swallow important failures.

## 23. Documentation

Update relevant documentation when behavior changes.

Keep documentation aligned with actual code.

Do not claim planned functionality is already implemented.

Document:

- New APIs
- New environment variables
- Approved migrations
- New business rules
- Important deployment requirements
- Known limitations

Avoid unnecessary documentation files for minor changes.

## 24. Deployment and Production Safety

Deployment requires explicit user approval.

Before production deployment, verify:

- Frontend and backend builds
- Required environment variables
- Production database configuration
- Authentication and authorization
- CORS and HTTPS
- Storage configuration
- Payment safety
- Migration readiness
- Relevant tests
- Production logging and error handling

Do not automatically deploy to Cloudflare, Hostinger, Supabase, or any other provider.

Do not assume the production hosting platform supports persistent connections or background workers.

## 25. QR Code Ordering

The restaurant may use a permanent QR code linking customers to the deployed public menu.

Phase 1 uses counter pickup.

Do not implement table-specific QR codes unless explicitly requested.

Generate a permanent QR code only after the public production menu URL is finalized.

Do not hardcode localhost URLs into production QR codes.

## 26. Future Features

Potential future work includes:

- Dine-in order type
- Optional table number
- Table-specific QR ordering
- Real payment gateway
- Automated refunds
- Enhanced notifications
- Production deployment improvements

These are not automatically authorized.

Do not implement future features unless specifically requested.

## 27. Mandatory Post-Change Verification

After making changes:

1. Review modified files.
2. Run `git diff --check`.
3. Run `git diff --stat`.
4. Run `git status --short`.
5. Run relevant checks and tests.
6. Confirm no unintended files changed.
7. Confirm no secrets were introduced.
8. Confirm no unresolved merge markers were introduced.
9. Confirm existing functionality was preserved as far as verified.

Do not automatically commit, push, merge, or deploy.

## 28. Final Response Format

After each coding task, provide:

### Implementation Summary
What changed and why.

### Files Modified
List actual modified files.

### Existing Functionality
Explain what was preserved and what was not verified.

### Testing
Show commands executed and results.

### Git Status
Report current branch, uncommitted changes, and conflicts.

### Remaining Issues
List known limitations, blockers, and manual verification needed.

### Approval Required
Identify any migration, dependency, deployment, or Git action requiring approval.

## 29. Primary Development Principles

1. Preserve working functionality.
2. Understand before editing.
3. Make the smallest safe change.
4. Avoid unnecessary merge conflicts.
5. Maintain security.
6. Keep customer and admin behavior consistent.
7. Validate backend business rules.
8. Protect payment and customer data.
9. Test relevant behavior.
10. Never deploy or perform destructive Git actions without approval.

These instructions remain applicable to every future development task unless explicitly overridden by the user.