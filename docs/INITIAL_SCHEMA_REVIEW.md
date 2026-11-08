# Proposed initial schema — review before execution

**No SQL was executed, no project was connected, and no environment settings were changed. Deployment remains on hold.**

The user confirmed testing project reference **wznkpgpexjexxzptuuwp** differs from development. This is the intended target for a future approved setup, not proof of which SQL Editor tab or application configuration is active. Reconfirm it before every execution. Never run the baseline in the development project.

## Prepared files

- `backend/migrations/000_initial_schema.sql`: proposed empty baseline containing only the six original table responsibilities.
- `docs/sql/inspect_initial_schema_metadata.sql`: metadata-only inspection of the current development schema, to be run manually if approved.
- `docs/sql/verify_initial_schema_setup.sql`: metadata-only verification after approved 000-015 setup in testing.
- This report: evidence, uncertainty, migration ownership and stop points.

Existing migrations, application code, credentials, historical reports and data were preserved. The baseline is reconciled with the **user-supplied current column, constraint, index, sequence-mapping and sequence-settings exports**, not a fresh database inspection. After a discrepancy was identified, the user explicitly confirmed the full exports take precedence: product_variants and order_items have **no created_at column**. This remains a compatibility reconstruction, **not an authenticated copy of the historical pre-001 schema**.

## Evidence and proposed core definitions

The backend has no ORM schema/model that defines the original DDL. Evidence comes from `routes/orders.ts`, `routes/admin.ts`, `routes/menu.ts`, `seedMenu.ts`, payment expiry, migration 001-015 and prior audit documentation. Existing inspection notes describe a current database, not necessarily the original pre-001 definitions.

| Table | Proposed columns in 000 | Backend/dependency evidence |
| --- | --- | --- |
| products | id VARCHAR(100) PK; name VARCHAR(150) and category VARCHAR(100) NOT NULL; image_url TEXT nullable; nullable available DEFAULT true and featured DEFAULT false; nullable created_at TIMESTAMPTZ DEFAULT now() | All these current types, NULL rules and defaults are verified in the full column export. |
| product_variants | id BIGSERIAL PK; required product_id VARCHAR(100) FK with ON DELETE CASCADE; required size VARCHAR(20) and price INTEGER; UNIQUE(product_id,size); no created_at | Column export verifies nextval/non-identity ID semantics; constraints verify price >= 0 and size Regular/Large. |
| restaurant_tables | id BIGSERIAL PK; table_number VARCHAR(20) NOT NULL UNIQUE; nullable is_active DEFAULT true; nullable created_at TIMESTAMPTZ DEFAULT now() | Column/constraint/ownership exports verify this shape. |
| orders | id UUID PK/default gen_random_uuid(); customer_name VARCHAR(100) NOT NULL; customer_phone VARCHAR(20) nullable; table_id BIGINT nullable FK; total_amount INTEGER NOT NULL; required payment_status/order_status VARCHAR(30); nullable created_at TIMESTAMPTZ DEFAULT now() | Current order_status default PLACED is reproduced in 000 because no later file supplies it. Payment default PENDING_PAYMENT remains in 003/004; lifecycle checks stay in 012. |
| order_items | id BIGSERIAL PK; required order_id UUID FK with ON DELETE CASCADE; nullable product_id VARCHAR(100) FK with NO ACTION; required product_name VARCHAR(150), size VARCHAR(20), quantity/unit_price INTEGER; no created_at | Current constraints verify quantity > 0 and unit_price >= 0. No item-size CHECK exists in the full constraint export, so the earlier proposed extra CHECK was removed. |
| payments | id BIGSERIAL PK; required order_id UUID UNIQUE FK with NO ACTION; transaction_reference VARCHAR(100) nullable; payment_status VARCHAR(30) required; nullable created_at TIMESTAMPTZ DEFAULT now() | Current payment default remains owned by 003/004; verified_at and other later fields are left to their migrations. |

Each field described as required is NOT NULL in the proposal, except the explicitly optional fields. No customer/order/session/menu data is seeded. Products, variants, tables, orders, items and payments may all start empty.

### Verified current definitions versus provisional reconstruction

- Four bigint ID sequences have nextval defaults, empty identity/generated flags and column ownership in the exports: BIGSERIAL reproduces these semantics. All five sequences start at 1, increment by 1, have min 1/max 9223372036854775807 and do not cycle. Original DDL spelling and sequence cache values are not supplied; no historical cache value is invented. 014 grants three ID sequences plus the order-number sequence, not the table-seeding sequence.
- All baseline text widths, NULL rules and current default expressions are now mapped from the full export. API validation limits are not used to infer database lengths. Later fields/defaults are still excluded where their owning migrations supply them.
- Current constraints verify INTEGER prices/unit prices >= 0, quantity/total > 0, variant size Regular/Large, all six PKs and both important unique keys. The extra item-size CHECK from the original proposal was not present and is removed. The listed FKs are NOT DEFERRABLE, initially immediate and validated, matching normal CREATE TABLE constraint defaults. Their historical introduction dates remain unproved.
- UUID generation uses pg_catalog.gen_random_uuid(). The baseline checks its availability and does not install an extension. Review an unsupported server/function rather than changing settings automatically.
- Four tables have nullable TIMESTAMPTZ created_at DEFAULT now(): products, restaurant_tables, orders and payments. Full column AND ownership exports omit it from variants/items, and the user confirmed those exports are authoritative. The temporary summary-based additions were removed. A default does not replace an explicit NULL.
- Both order status columns are VARCHAR(30) NOT NULL. The verified current legacy order_status DEFAULT 'PLACED' is reproduced in 000 (no later migration supplies it), without claiming that it was necessarily present pre-001. The current backend explicitly inserts PENDING_PAYMENT for both states, and operational visibility also requires trusted paid metadata; the default is not payment confirmation. Payment-status defaults/checks remain in 003/004/012.
- Original table_id and transaction_reference nullability cannot be inferred just because 002/003 drop NOT NULL. The proposal permits NULL; those later operations remain compatible no-ops where appropriate.
- Verified FKs: product_variants.product_id→products and order_items.order_id→orders ON DELETE CASCADE; the other three original FKs ON DELETE NO ACTION. All have ON UPDATE NO ACTION, nondeferrable/validated semantics and names matching the export. CASCADE can delete child rows after a privileged parent deletion; no deletion is performed by 000. Runtime role 014 still cannot DELETE orders/payments. No extra cascades are added.
- Two key uniqueness requirements belong in 000: product_variants(product_id,size) and payments(order_id). No later migration supplies them. Both, and restaurant_tables.table_number uniqueness, are verified by the complete constraint/index exports.

**STOP 1 — history and known drift:** Full current exports have now been supplied and reviewed. They do not prove pre-001 history. Retain later additions in their owning migrations and decide the explicit divergences below before approval; do not pull later columns into 000 to conceal them.

### Verified observations that are intentionally NOT copied blindly

- No custom triggers were found on the six tables; 000 creates none.
- RLS enabled, FORCE RLS disabled and no six-table policies are verified current observations. 000 matches this state; 014 later adds backend policies and 015 forces RLS only on sessions, which are not one of the original six.
- Duplicate created_at/order_number indexes exist in development. 000 adds neither duplicate nor speculative performance indexes. Required later indexes stay in 001/003/005. Development is not changed.
- **Unresolved sequence conflict:** development order_number_seq is unowned, but unchanged 003 explicitly uses OWNED BY orders.order_number; 004 does not undo it. Thus the fresh 000→015 chain produces a column-owned order-number sequence. 000 deliberately does not pre-create or detach that later-owned object. A future approved forward migration or an explicitly accepted documented divergence is needed; do not change 003 or development within this task.
- **Unresolved later type conflict:** development orders.order_number is VARCHAR(30); 003 creates TEXT and 004's VARCHAR(32) ADD IF NOT EXISTS does not alter an existing column. Fresh history therefore yields TEXT. Keep the column out of 000 and resolve/accept this separately rather than faking a historical baseline definition.
- Full development exports omit orders_fulfillment_type_check from 002 and the two lookup indexes order_items_order_id_idx/payments_order_id_idx from 001. Fresh ordered history creates them. Do not remove those migrations' protections/indexes or assert exact current-schema parity.
- Current claim input accepts up to 120 characters, while verified payments.transaction_reference permits 100. Inputs 101-120 can pass request validation and fail at the database. This is an application/schema contract issue for a separately approved fix, not permission to widen the metadata-backed baseline or change backend code here.

## What later migrations own

“Own” means the reconstruction leaves provisioning to that migration. An ADD COLUMN IF NOT EXISTS does not prove the column never existed before it.

| Migration | Excluded from 000 / later responsibility |
| --- | --- |
| 001_order_idempotency_tracking.sql | idempotency_key, request_hash, tracking_token_hash; unique retry-key and lookup indexes |
| 002_counter_pickup_orders.sql | fulfillment_type, pickup default/check and table_id nullability adjustment |
| 003_demo_payments_and_order_numbers.sql | order_number, order_number_seq, paid_at on orders/payments; payment_source/default/check; payment-status defaults/checks; reference nullability adjustment |
| 004_order_creation_schema_repair.sql | Repairs/rechecks 001/003 fields/indexes and advances order_number_seq; does not bootstrap missing tables |
| 005_admin_dashboard.sql | admin_sessions; verified_by/verified_at/verified_transaction_reference; verified-reference uniqueness; dashboard indexes |
| 006_menu_management.sql | description, availability_status, archived_at and associated check/index |
| 007_order_fulfillment_choice.sql | order_type/table_number and their defaults/checks |
| 008_dynamic_categories.sql | categories, normalized-name uniqueness, products.category_id and FK |
| 009_category_sort_order.sql | categories.sort_order and uniqueness |
| 010_restaurant_ordering_settings.sql | restaurant_settings and singleton row id=1; initial accepting flag true |
| 011_restaurant_weekly_opening_hours.sql | opening_hours JSON and all-day schedule default |
| 012_payment_attempt_lifecycle.sql | payment_expires_at, final status checks, pending lifecycle repair, reconciliation flags/indexes |
| 013_product_tags.sql | tags/product_tags and association cascade FKs |
| 014_backend_runtime_role.sql | New backend role/grants, server-role policies, RLS on all 11 tables |
| 015_admin_sessions_client_isolation.sql | Session table/column client revocations, FORCE RLS and access assertions |

For example, the development payments table may already have verified_at from an older setup. Leaving it to 005 still creates a compatible fresh schema without claiming that its original introduction date is known.

## Safety safeguards in the proposed baseline

- Transactional DDL with lock/statement timeouts; no IF NOT EXISTS hiding a pre-existing wrong schema.
- Preflight rejects any of the 11 application tables or five named sequences already present in public. It does not drop or repair them. Existing objects cause a stop, not permission to delete them.
- No inserts/updates/deletes/truncation, credential provisioning, role creation, extension installation or environment changes.
- Enables RLS with **no policies** on the six new tables and revokes PUBLIC/anon/authenticated table and sequence privileges, including TRUNCATE and sequence manipulation. These are **new fresh-bootstrap protections**, not claimed historical definitions. They affect only tables/sequences freshly created in that transaction.
- No grants to clients and no change to Supabase platform roles/default privileges. Owners/BYPASSRLS/service credentials remain privileged; this is not complete platform hardening.
- 014 can enable RLS again and add its role-scoped policy without conflicting with 000, because 000 creates no policies. 015 still handles admin_sessions created later by 005.
- Other tables created by 005/008/010/013 are outside the baseline's six-table safeguards. Keep the environment isolated and review Data API/default-grant settings throughout setup; do not expose the half-migrated schema.

## Manual development inspection queries

Use `docs/sql/inspect_initial_schema_metadata.sql` only in the existing development project's **manually confirmed** SQL Editor, if you choose to run it. Codex has not connected or run it.

The file uses BEGIN READ ONLY and ROLLBACK, with only catalog/schema SELECTs. It reports exact column types/lengths/nullability/defaults/identity flags, PK/UNIQUE/FK/CHECK definitions/actions, indexes, sequence ownership/settings (not counters), trigger names/function dependencies, RLS flags and policy names. It never reads application rows, hashes, tokens, passwords, secret catalogs or trigger function bodies. Review metadata output before sharing, especially if your own custom defaults contain sensitive literals. A database named postgres does not prove the project identity.

The supplied full exports now establish the current column/constraint/index/sequence definitions. The earlier summary remains evidence for no custom triggers and the RLS/FORCE/policy state, except its timestamp claim was explicitly superseded. Keep these supplied observations separate from historical provenance and deliberate ACL safeguards. The query file distinguishes sequence ownership from default references; it is provided for optional future manual confirmation, not because Codex connected. Do not call nextval/setval or inspect customer/session rows.

## Proposed testing execution order and conflict review

**STOP 2 — approval:** The target reference is confirmed by the user, but the draft's unresolved schema choices and SQL execution are not approved. Do not run any migration yet. No testing project has been inspected or certified safe.

After review and explicit approval, the numeric order is:

```text
000_initial_schema.sql
001_order_idempotency_tracking.sql
002_counter_pickup_orders.sql
003_demo_payments_and_order_numbers.sql
004_order_creation_schema_repair.sql
005_admin_dashboard.sql
006_menu_management.sql
007_order_fulfillment_choice.sql
008_dynamic_categories.sql
009_category_sort_order.sql
010_restaurant_ordering_settings.sql
011_restaurant_weekly_opening_hours.sql
012_payment_attempt_lifecycle.sql
013_product_tags.sql
014_backend_runtime_role.sql
015_admin_sessions_client_isolation.sql
```

Run as an approved migration owner, one whole file at a time. Stop on every error. 000/014/015 have explicit transactions; do not assume the other files or sequences are fully reversible merely because a tool reports an error. Record file checksums/results in a migration log. Existing schemas/snapshots follow a separate reconciliation path, not this fresh baseline.

| Possible conflict | Review outcome |
| --- | --- |
| 001-003 unqualified table names | Confirm subsequent SQL Editor search_path resolves public; 000's SET LOCAL ends at COMMIT. |
| 001 retry keys/indexes | Still introduced here. Full development exports omit its item/payment lookup indexes; fresh history creates them. No duplicate legacy indexes are copied. |
| 002 fulfillment | Adds its own VARCHAR(20) field/check/default and permits NULL table_id; this does not establish historical table_id nullability. |
| 003 adds order_number TEXT; 004 proposes varchar(32) IF NOT EXISTS | Normal ordered path retains TEXT, differing from exported VARCHAR(30). Backend treats it as a string; harmless for fresh testing, though not exact schema parity. IF NOT EXISTS does not alter the type. |
| 003/004 NULL reference changes | Safe with this nullable baseline. No original reference-required rule is asserted. |
| 003/004 payment checks/defaults; 012 replaces checks | Baseline leaves payment defaults and lifecycle checks to these files, so final 012 states are not blocked by an obsolete extra check. The separately verified legacy order default is recorded below. Do not run the app between migrations. |
| Legacy order_status default | 000 now reproduces exported PLACED; later migrations do not supply it. Checkout explicitly inserts PENDING_PAYMENT, so the database default must not be confused with the actual API lifecycle or a trusted payment confirmation. |
| 004 setval | It can advance numbering; sequence gaps are not corruption. Do not verify by allocating a number. |
| 005 session/verification metadata | Definitions and unique verified-reference index stay here; no current session or verified-payment rows are copied. Its session table still needs 014/015 security before use. |
| 003 sequence ownership versus development | Accepted harmless fresh-testing difference: 003 owns order_number_seq by orders.order_number; development is unowned. Number allocation is unaffected; dropping the owning column/table would drop its sequence. |
| 006/008 legacy available/category | Both retained in 000. Empty tables need no product seed to let migration complete. After 008 create categories before adding products. |
| 006 nullable legacy available | The migration maps only available IS TRUE to AVAILABLE; NULL maps to COMING_SOON. Retaining the verified nullable flag does not require a schema change to 006. |
| 007 order type/table number | Later TEXT additions/defaults/checks remain here, not pulled into 000 from the current schema; original table metadata must not be confused with these order display fields. |
| 009 partial category sorting | Fresh empty categories are safe; existing partial state requires review rather than re-running. |
| 010/011 initial open settings | Defaults are accepting=true and open 24/7. A separately approved pause/hours step is required before exposing ordering. No settings update is included here. |
| 012 expiry backfill | Corrected orders.created_at permits explicit NULL. Existing rows with NULL creation and expiry times would fail payment_expires_at SET NOT NULL. Empty fresh setup is unaffected; no rows should be inserted before 012. Do not silently restore NOT NULL or backfill development. |
| 013 product_tags FK | 000 now uses VARCHAR(100) for product IDs; 013 retains its TEXT association FK unchanged. The type difference must be verified in approved PostgreSQL integration, not “fixed” by moving/changing the later definition. Association cascades remain owned by 013. |
| 014 sequence/role/policies | Exact required sequences are created in 000/003. Role creation and policy names must be absent; inherited CREATE privilege guard must pass. Never delete an existing role/policy to bypass failure. |
| 014 row locks | Its grants include catalog UPDATE and restaurant_tables UPDATE(id), supporting FOR SHARE/FOR KEY SHARE despite a read-only table lookup. |
| 015 FORCE RLS | Its backend policy/grants must already exist. No session rows need copying; admin login creates new ones after separate role/password/environment provisioning. |

Additional backend observations: current checkout sends a product_id for every new item despite the verified nullable database column. Tracking retains item snapshots independently of that FK; TypeScript interfaces may still describe the ID as a string, so legacy NULL-reference rows need an approved compatibility test rather than an invented NOT NULL constraint. No custom triggers or variant/item timestamps are introduced. Nullable flags remain checked with explicit boolean conditions. The customer claim-reference mismatch is corrected in the follow-up below; the separate admin verified reference remains 120 characters.

014/015 remain proposals. Approve their initial disposable application before the real-DB suite that depends on them; production application requires successful disposable results. The baseline does not bootstrap Supabase Auth users, Storage buckets, admin passwords, API keys or the integration-test marker schema.

## Verification checklist — after future approved execution

- [ ] Reconfirm testing reference wznkpgpexjexxzptuuwp and that development is not the active SQL Editor target.
- [ ] Before 000: review the supplied-export reconciliation, historical uncertainties and explicit order-number ownership/type divergences. Accept documented drift or authorize a separate forward migration; no execution approval is inferred.
- [ ] After approved 000: six tables and PKs; four owned bigint ID sequences; nullable TIMESTAMPTZ/defaults on four tables and no created_at on variants/items; verified VARCHAR widths, flags, nullable item product reference, both CASCADE FKs and other NO ACTION FKs. All six tables RLS-enabled, FORCE off, no policies. Match PK/UNIQUE/CHECK definitions to exports; no invented item-size check and no data seed.
- [ ] After 001-004: retry/tracking fields and indexes; fulfillment default/check; payment/order-number fields and sequence; reference nullable.
- [ ] After 005-009: session/verification fields, catalog management/category fields and indexes; do not use the restricted role before 014.
- [ ] After 010-013: singleton settings and JSON schedule; final payment/order status constraints; expiry/reconciliation fields; tags/association FKs. Review the initial accepting/open state.
- [ ] After 014-015: 11 RLS-enabled tables and 11 backend-only policies; forced session RLS; new role not owner/elevated; expected narrow table/column/sequence grants; client session permissions and backend-role membership false.
- [ ] Run/review `docs/sql/verify_initial_schema_setup.sql` manually only after approval. Missing-column, unexpected timestamp, reconciled original-column and invented item-check queries must return zero rows; FK/sequence checks must match. Later order-number type/ownership checks separately show chain compatibility and development parity; expect documented differences until resolved. Do not label those rows an exact clone. It reads metadata only.
- [ ] Provision runtime login/password, verified TLS and isolated application/test settings separately and securely. NOLOGIN immediately after 014 is intentional, not a failed migration.
- [ ] After separate authorization, run actual-connection security verification and disposable integration tests covering checkout, locks, cancellation/expiry, manual verification races, admin sessions, tracking, catalog CRUD and hours. The marker and guard configuration from the Phase 2 report are additional test setup, not part of 000.
- [ ] Do not claim migration compatibility or production readiness until actual SQL and integration tests pass in the confirmed testing project. No real customer payments, development orders or development sessions belong in this fresh setup.

## Validation and Git

Validation used local source/document review, retrieval of the relevant side-conversation analysis, user-supplied exports and Git/text checks. No SQL parser/database execution, database connection, backend startup, environment change or credential operation was performed. SQL compatibility is a source-level review, not an executed PostgreSQL result. Application code and migrations 001-015 are unchanged.

This reconciliation changes only 000 and its directly related review/verification/inspection files. Existing migrations 001-015, application code, indexes and all development data remain untouched. Source-only validation and final Git status are recorded below; SQL execution and database-backed results remain unavailable by instruction. Stop for review before any migration execution.

Final source checks passed: six core tables, 35 original columns, four nullable created_at columns, four bigint nextval generators, verified VARCHAR widths, two CASCADE and three NO ACTION FKs, and no fabricated item-size CHECK. Metadata-only source scans passed after excluding SQL string literals/comments (expected default-expression strings legitimately contain the text nextval, but do not allocate a sequence). Whitespace/conflict-marker scans and git diff --check passed; no unmerged paths were reported. None of these checks is PostgreSQL parsing or SQL execution. No application builds/tests were run for these SQL/document-only changes.

Git branch: `main`. The same four existing untracked proposal/review files were revised in place; no tracked files were modified and git diff --stat is empty because it excludes untracked files. Existing source/migration changes were preserved; migrations 001-015 and backend/src have no diff. No environment/credential changes, SQL execution, database connection, commit, push, merge or deployment occurred. Both databases remain untouched.

## Follow-up review: fresh testing database

| Difference | Classification |
| --- | --- |
| Customer reference 120 versus column 100 | Blocking defect corrected in API/customer input: limit 100. Admin verified reference remains 120. Boundary test rejects 101 before database access and accepts 100 as pending verification only. |
| Order number TEXT versus development VARCHAR(30) | Harmless for backend string handling and generated FR numbers. 004 does not change the TEXT added by 003. Exact parity is not claimed. |
| Order-number sequence owned versus development unowned | Harmless for nextval/backend behavior. Ownership affects future DROP lifecycle: dropping its owning column/table also drops the sequence. Keep 003 ownership unchanged. |
| Duplicate development indexes omitted; fresh 001 lookup indexes/002 check present | Harmless for valid backend requests; deliberate fresh-history performance/enforcement differences. |
| 013 TEXT FK versus VARCHAR(100) parent | PostgreSQL text/varchar comparisons are compatible; no known source-level blocker. Actual 013 execution/catalog verification still required. |
| Nullable original fields/four timestamps | Harmless for empty setup/current explicit inserts. Historical NULL rows need integration coverage. |
| NULL order dates inserted before 012 | Blocking expiry backfill if present. No app traffic/financial seeds between migrations. |
| Unknown historical payment defaults/check provenance | Nonblocking empty reconstruction: later migrations provide lifecycle checks/defaults. Not proof of historical identity. |
| Default accepting/open-24-hours settings | Nonblocking schema setup; blocks exposing ordering until configured. |
| 014 existing role/policies, missing objects, inherited CREATE | Blocking: stop and inspect; never delete objects or weaken guards to force success. |
| 015 inherited client privileges/missing backend policy | Blocking security failure. Stop for review. |
| No real PostgreSQL/runtime-role integration results | Blocks readiness sign-off. Source review is not executed verification. |

This resolves the earlier order-number entries as accepted differences for fresh testing, not exact development parity. Earlier validation/Git paragraphs describe the previous baseline-only review, not this application follow-up.

### Prerequisites and stop points

Use the exact filename sequence above, 000 through 015, one complete file at a time after explicit approval. Reconfirm project wznkpgpexjexxzptuuwp in SQL Editor. Stop after 000 for baseline checks, after 013 before security changes, after 014 before 015, and after 015 before application traffic. Stop at every error. An aborted transaction requires ROLLBACK before inspecting/retrying.

Before 014: 000-013 completed; all 11 tables/four granted sequences exist; run as migration owner with CREATE ROLE, grant and table-alter authority. fruits_roots_backend and fr_backend_access policies must be absent. PUBLIC must not confer schema/database CREATE on the new role. Review unexpected grants separately, without bypassing the guard. No app traffic yet.

Before 015: 014 committed and backend-only policies/grants reviewed; anon/authenticated/authenticator have no backend membership. Migration owner can revoke privileges and alter RLS. Preserve sessions; no development sessions need copying. 014 intentionally creates NOLOGIN: provision runtime login/secret, validated TLS and isolated settings separately after approval. Never grant backend membership to client roles. Initial disposable application needs approval before its dependent integration tests; production changes require those tests to pass.

### Verification SQL and expected results

Run docs/sql/verify_initial_schema_setup.sql only after separate approval in the confirmed testing project. Each query has expected results in comments. Expect 11 present RLS tables; zero missing columns/original-column mismatches; five correctly configured sequences; four ID sequences owned by their ID columns plus order_number_seq owned by orders.order_number; five matching original FKs; no variant/item timestamps or custom triggers; 11 backend-only policies; forced session RLS; forbidden client/session and backend escalation privileges false. Order-number chain checks should be true; development type/ownership parity checks intentionally false. These are expectations, not executed results.

Additional final type/length query: exactly three rows, all matches=true.

```sql
SELECT table_name, column_name, data_type, character_maximum_length,
  CASE column_name
    WHEN 'transaction_reference' THEN character_maximum_length = 100
    WHEN 'verified_transaction_reference' THEN character_maximum_length = 120
    WHEN 'order_number' THEN data_type = 'text'
  END AS matches
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'payments' AND column_name IN ('transaction_reference','verified_transaction_reference'))
    OR (table_name = 'orders' AND column_name = 'order_number'))
ORDER BY table_name, column_name;
```

Catalog checks cannot establish runtime authorization, locking or concurrent verification safety. Actual-runtime-role disposable integration remains required. Baseline and migrations 001-015 remain unchanged. No database connection, SQL execution, environment/credential change or deployment occurred.

Follow-up local verification: backend npm test 55 passed/0 failed; backend npm run build passed; frontend npm run lint and npm run build passed. git diff --check passed. Database integration and SQL execution were not run. Branch main; three tracked application/test files modified, existing untracked baseline/review/two SQL inspection files preserved. No unmerged paths reported.
