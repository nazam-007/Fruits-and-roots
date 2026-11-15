# Post-provision preview verification — PLAN ONLY, separate approval required

No connection/provisioning now. Proposed target only mrjsfznxbwjsdzyuzvsi.
Never connect inspection code or tests to wznkpgpexjexxzptuuwp. Protected snapshot
remains untouched. Credential provisioning and each data-read scope below need approval.

## Actual-role connection, not SET ROLE from postgres
Use the exact pinned project/endpoint, preview login (pooler username
fruits_roots_menu_preview.mrjsfznxbwjsdzyuzvsi), validated TLS/hostname and a dedicated
connection. No owner/service-role credentials. Do not print URL/password or raw errors.
After BEGIN READ ONLY and 15s statement timeout, execute identity below as a separate
step. Stop/ROLLBACK/close unless role/database/read-only and certificate checks pass.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT current_user,session_user,current_database(),
 current_setting('transaction_read_only') AS read_only;
```
Expected current_user=session_user=fruits_roots_menu_preview, database postgres,
read_only on. Use actual TLS socket certificateAuthorized=true, not pg_stat_ssl
alone. Do not claim upstream encryption verified through the pooler.

## Allowed reads and actual menu query
Separately approve menu-only reads. Run the EXACT previewMenuSql exported from
backend/src/previewMenu.ts using pg parameter arrays approvedPreviewIds and the
four category names in order. No rewritten query/model substitute. Assert response
IDs are within the manifest, category joins resolve, variants are Regular/Large
with preserved stored prices, all returned rows are unarchived. Keep result rows
private; report counts/mismatch categories only. Expect at most 37 IDs, not exactly
37: Dragon, Beetroot, ABC remain absent until separate restoration approval.
Execute direct SELECTs below (without backend WHERE allowlist) to prove RLS, not
just application filtering. Compare the privately obtained IDs to the manifest.

```sql
SELECT id FROM public.categories;
SELECT id FROM public.products;
SELECT product_id,size FROM public.product_variants;
SELECT count(*) AS visible_unapproved FROM public.products
WHERE id IN ('banana-shake-25bbec6e','banana-shake-039d6641',
 'banana-shake-efc90b34','banana-shake-40d8017d');
SELECT count(*) AS visible_unapproved_variants FROM public.product_variants
WHERE product_id IN ('banana-shake-25bbec6e','banana-shake-039d6641',
 'banana-shake-efc90b34','banana-shake-40d8017d');
```
Expect zero for both counts. All direct variant parent IDs must be approved and
visible as products. Existing archived IDs must remain invisible, not modified.

## Sensitive access denial WITHOUT retrieving records
Each probe uses a SAVEPOINT on the SAME actual-role READ ONLY transaction.
SELECT 1 ... LIMIT 0 checks permission without fetching application rows.
Expected SQLSTATE 42501. Unexpected success fails verification immediately.
After an expected error the client must ROLLBACK TO SAVEPOINT before continuing.
Commands below are client-driven steps, not an unattended SQL Editor batch.

```sql
SAVEPOINT deny_orders;
SELECT 1 FROM public.orders LIMIT 0;
-- Client expects 42501; then:
ROLLBACK TO SAVEPOINT deny_orders;
RELEASE SAVEPOINT deny_orders;

SAVEPOINT deny_order_items;
SELECT 1 FROM public.order_items LIMIT 0;
ROLLBACK TO SAVEPOINT deny_order_items;
RELEASE SAVEPOINT deny_order_items;

SAVEPOINT deny_payments;
SELECT 1 FROM public.payments LIMIT 0;
ROLLBACK TO SAVEPOINT deny_payments;
RELEASE SAVEPOINT deny_payments;

SAVEPOINT deny_sessions;
SELECT 1 FROM public.admin_sessions LIMIT 0;
ROLLBACK TO SAVEPOINT deny_sessions;
RELEASE SAVEPOINT deny_sessions;
ROLLBACK;
```
An undefined relation is NOT verified denial. The prior inspection found no
customers relation. If separately approved metadata later identifies one, approve
its exact probe first; do not invent/create a customers table. Check cross-schema
reads, mutations/MAINTAIN/sequence privileges and role memberships with the existing
preview startup metadata verifier. No INSERT/UPDATE/DELETE/TRUNCATE/nextval/setval
negative probes against the original database. SQL permissions are necessary but
not proof of Data API HTTP denial; actual client HTTP tests need separate approval.

Always attempt ROLLBACK and close on any unexpected result/error. Save sanitized
results privately. Do not deploy or run checkout/payment/admin mutations afterwards.

## Query/RLS relationship review
Real query joins products.category_id=categories.id; three SELECT grants and
categories policy allow that join. Product policy is permissive SELECT true AND
restrictive non-archived/37-ID condition. Variant scope uses an EXISTS parent query;
parent SELECT policies apply and the explicit parent ID check repeats the manifest.
Product policy has no variants dependency, so no circular RLS recursion. Scalar
variant aggregate executes with the actual preview role and variant RLS. Empty
variants coalesce to JSON []; no variants are fabricated and prices aren't derived.
Availability is forced false in SQL/response; the GET-only preview cannot order.

## Disposable local PostgreSQL 17 validation still required
Docker Desktop engine was unavailable; only native PostgreSQL 18 was found. No
services/containers started, no database connections attempted. Do not substitute
18 results for 17. Once an isolated PG17 runtime is separately available, create
synthetic roles/tables/sequences in a disposable database only (no Supabase URLs,
no copied records). Execute proposals there and verify:
- Missing and wrong-kind expected sequences each abort BEFORE any ACL/RLS changes.
- Global table/sequence defaults to PUBLIC, direct clients or inherited groups cause
  refusal; schema-only grants are removed. Other-schema/global defaults unchanged.
- MEMBER true with INHERIT false and SET false remains conservatively rejected;
  USAGE/SET checks are distinct, not substitutes for MEMBER semantics.
- Approved/unarchived, approved/archived, unapproved/unarchived products and their
  variants show only approved/unarchived rows through direct SELECT and real query.
- An additional permissive PUBLIC SELECT policy cannot bypass restrictive scopes.
- Runtime preview role remains unable to read synthetic sensitive tables or mutate.
None of these real-SQL fixture tests have been executed in this task.
