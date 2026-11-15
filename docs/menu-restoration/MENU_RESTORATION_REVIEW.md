# Non-destructive cafe menu restoration — proposal for review

**NOT EXECUTED. No staging target has been approved.** No database connection,
SQL execution, migration, seed, environment change, process restart, commit,
push or deployment is part of this preparation.

## Reference and business decisions

Use the approved read-only inspection of `mrjsfznxbwjsdzyuzvsi` for the 34 matched
original products. It contained 38 products in total: 34 matches and four separate
Banana Shake records. Three repository products were absent, including archived
records. Restore Dragon (169/328), Beetroot (59/108), ABC (99/188) from the repository.
Prices here are whole INR rupees, not paise. Preserve Avocado Sandwich 90/170 and
Aalu Cheese Burger Regular 110 with no Large variant and AVAILABLE status. All
other matched product prices, sizes and availability match the inspected snapshot.
The manifest freezes explicit numbers; it does not recalculate Large prices.

`approved-menu.manifest.json` records owner-approved business values, NOT execution
approval. Source metadata is a snapshot and may become stale: recheck menu-only
drift before approving an import. Stable original product IDs are retained.

## Proposed inventory and category order

| Order | Category | Products | AVAILABLE | COMING_SOON |
| --- | --- | ---: | ---: | ---: |
| 0 | Liquid Therapy | 25 | 23 | 2 |
| 1 | Fruitopia | 4 | 4 | 0 |
| 2 | Guilty Pleasures | 5 | 5 | 0 |
| 3 | Bread & Bite | 3 | 3 | 0 |
| Total | | 37 | 35 | 2 |

Expect **69 variants**, no archived imported products, and no Banana Shake records
in a fresh target containing only this candidate manifest. Filter Coffee and
Turkish Tea remain COMING_SOON without price variants. Aalu Cheese Burger has
Regular only. All other available products have Regular and Large variants.

This is a provisional 37-product original-menu staging candidate. Excluding Banana
Shake from a NEW target does not delete, rename, unarchive or change its source
records. If the owner later approves its sold-out active entry, the candidate
would become 38 products; do not add it automatically. The reference database
remains 38 products: this plan does NOT add the missing three to that database.

| Product ID | Name | Category | Regular INR | Large INR | State |
| --- | --- | --- | ---: | ---: | --- |
| drink-banana | Banana | Liquid Therapy | 129 | 248 | AVAILABLE |
| drink-date | Date | Liquid Therapy | 139 | 268 | AVAILABLE |
| drink-date-&-banana | Date & Banana | Liquid Therapy | 149 | 288 | AVAILABLE |
| drink-mango | Mango | Liquid Therapy | 149 | 288 | AVAILABLE |
| drink-kiwi | Kiwi | Liquid Therapy | 159 | 308 | AVAILABLE |
| drink-dry-fruit | Dry Fruit | Liquid Therapy | 159 | 308 | AVAILABLE |
| drink-dragon | Dragon | Liquid Therapy | 169 | 328 | AVAILABLE |
| drink-blueberry | Blueberry | Liquid Therapy | 169 | 328 | AVAILABLE |
| drink-strawberry | Strawberry | Liquid Therapy | 169 | 328 | AVAILABLE |
| drink-avocado | Avocado | Liquid Therapy | 199 | 388 | AVAILABLE |
| drink-pineapple | Pineapple | Liquid Therapy | 89 | 168 | AVAILABLE |
| drink-mosambi | Mosambi | Liquid Therapy | 89 | 168 | AVAILABLE |
| drink-watermelon | Watermelon | Liquid Therapy | 89 | 168 | AVAILABLE |
| drink-beetroot | Beetroot | Liquid Therapy | 59 | 108 | AVAILABLE |
| drink-abc | ABC | Liquid Therapy | 99 | 188 | AVAILABLE |
| drink-grape | Grape | Liquid Therapy | 129 | 248 | AVAILABLE |
| drink-mix-fruit | Mix Fruit | Liquid Therapy | 129 | 248 | AVAILABLE |
| drink-anar | Anar | Liquid Therapy | 129 | 248 | AVAILABLE |
| drink-orange | Orange | Liquid Therapy | 149 | 288 | AVAILABLE |
| drink-apple | Apple | Liquid Therapy | 169 | 328 | AVAILABLE |
| drink-lassi | Lassi | Liquid Therapy | 69 | 128 | AVAILABLE |
| drink-cold-coffee | Cold Coffee | Liquid Therapy | 159 | 308 | AVAILABLE |
| drink-persian-tea | Persian Tea | Liquid Therapy | 35 | 60 | AVAILABLE |
| drink-turkish-tea | Turkish Tea | Liquid Therapy | — | — | COMING_SOON |
| drink-filter-coffee | Filter Coffee | Liquid Therapy | — | — | COMING_SOON |
| mix-fruit-salad | Mix Fruit Salad | Fruitopia | 99 | 149 | AVAILABLE |
| exotic-fruit-salad | Exotic Fruit Salad | Fruitopia | 249 | 549 | AVAILABLE |
| fruit-date-delight | Fruit Date Delight | Fruitopia | 149 | 199 | AVAILABLE |
| biscoff-fruit-custard | Biscoff Fruit Custard | Fruitopia | 99 | 188 | AVAILABLE |
| brownie-strawberry | Brownie Strawberry | Guilty Pleasures | 199 | 388 | AVAILABLE |
| strawberry-chocolate | Strawberry Chocolate | Guilty Pleasures | 99 | 169 | AVAILABLE |
| single-choco-waffle | Single Choco Waffle | Guilty Pleasures | 99 | 188 | AVAILABLE |
| triple-choco-waffle | Triple Choco Waffle | Guilty Pleasures | 129 | 248 | AVAILABLE |
| fruit-choco-waffle | Fruit Choco Waffle | Guilty Pleasures | 159 | 308 | AVAILABLE |
| avocado-sandwich | Avocado Sandwich | Bread & Bite | 90 | 170 | AVAILABLE |
| paneer-sandwich | Paneer Sandwich | Bread & Bite | 99 | 188 | AVAILABLE |
| aalu-cheese-burger | Aalu Cheese Burger | Bread & Bite | 110 | — | AVAILABLE |

## Files and schema prerequisites

- `approved-menu.manifest.json`: exact 37-product proposal and source provenance.
- `proposed_staging_menu_import.sql`: self-contained insert-only import proposal.
- `verify_staging_menu.sql`: SELECT-only validation; does not repair data.

Use a separately approved staging schema compatible with reviewed migrations
000-013 at minimum for this menu operation. Products need `category_id`,
`availability_status`, `archived_at` and the original fields; categories need a
unique normalized name and unique NOT NULL sort_order; variants need unique
(product_id,size), valid size/price checks and their product FK. This import does
not install schema, change permissions or run 014-016. Full application staging
may require separately reviewed security/payment migrations, including the known
016 null-guard/source-history reconciliation; this is not migration approval.

The approved staging operator must have the needed insertion, locking and temporary
table privileges. Do not grant privileges to the runtime role just to run this.
No actual staging UUIDs/category IDs are invented: new categories use their UUID
default and products map to the target categories by normalized name.

## Import safety and reruns

1. Independently verify a NEW staging project's reference and connection. Both
   existing projects (`mrjsfznxbwjsdzyuzvsi`, `wznkpgpexjexxzptuuwp`) are forbidden.
   The approval-reference placeholder deliberately raises before persistent changes;
   replacing it is an operator approval guard, NOT actual project identity proof.
2. Review the exact manifest/script revision and menu/schema drift. Keep staging
   offline to customer traffic and other admin writers for the approved import.
3. Missing categories are inserted first. Existing normalized names are mapped.
   Conflicting sort positions/order cause refusal; existing category edits are
   never rewritten. Do not run this on the reference database's current ordering.
4. Existing active names with different IDs cause refusal for manual mapping review.
   Existing IDs, including archived IDs, are left entirely unchanged. No variant
   additions, price updates, image replacement or restoration occurs for them.
5. Insert missing manifest products with category_id correctly resolved. Only IDs
   inserted by THIS transaction receive their explicit variants. This preserves
   newer admin edits/removals on a later rerun; existing empty variants are NOT
   automatically repaired. Verification reports drift rather than overwriting it.
6. Menu-table locks protect the insert-only existence checks from concurrent admin
   writes. Lock timeout is 5s and statement timeout 30s. All permanent inserts are
   one transaction. There is no ON CONFLICT DO UPDATE, DELETE, TRUNCATE, sequence
   reset, financial query or persistent schema alteration. Temporary work tables
   are transaction-local and cleaned up at transaction end.
7. The final statement is ROLLBACK by default. A separately approved dry run may
   temporarily insert rows inside its transaction; it is NOT a read-only check.
   Nothing in these SQL files has been executed. Changing the final action to
   COMMIT requires explicit approval of the target, script revision and scope.
8. After a committed clean import, rerunning the same approved import inserts zero
   products/variants and preserves existing admin edits. Run the SELECT validation
   separately to distinguish expected counts from accepted post-import drift.

Descriptions and tags were not exported in the approved three-table inspection.
New target products receive no invented descriptions/tags. The 34 matched products
had no stored images; new target rows use NULL image_url, allowing existing frontend
fallbacks. Created-at timestamps use normal target defaults, not invented history.
If descriptions/tags must be recovered, approve further menu-only export first;
product_tags/tags access requires separate permission under the original scope.

## Banana Shake investigation — preserve all four

| Existing ID | State in approved metadata | Regular/Large INR | Stored image |
| --- | --- | --- | --- |
| banana-shake-25bbec6e | SOLD_OUT; not archived | 70/130 | Supabase public image reference |
| banana-shake-039d6641 | Archived; AVAILABLE flag | 70/130 | None |
| banana-shake-efc90b34 | Archived; AVAILABLE flag | 70/130 | None |
| banana-shake-40d8017d | Archived; AVAILABLE flag | 70/130 | None |

No Banana Shake literal/ID was found in the inspected tracked menu/seed/integration
fixture history across local Git refs. The admin create-product endpoint generates
`<normalized-name>-<8 random hex characters>` using randomBytes(4); these IDs match
that format. This is consistent with separate admin/API creations, NOT proof of
who created them, when, or whether they are legitimate products. All prices agree;
three archived records could be prior versions/tests, but that remains a hypothesis.
Names do not constitute duplicate identity; stable IDs are distinct. No merging or
reference reassignment is proposed. Do not query order/payment links to investigate
without separate permission. No additional database tables were accessed here.

Recommended next investigation: owner identifies whether the sold-out image-bearing
entry is genuine; if needed, separately approve another read-only products/variants
inspection for created_at/archived_at values. Attribution/audit-table inspection
would require explicit additional table approval. Keep the three archived entries
untouched even if the active entry is later approved for a future staging manifest.

## Images

Six existing matched products lack both stored image references and ID fallback
mappings: **Date, Watermelon, Lassi, Fruit Date Delight, Single Choco Waffle, Fruit
Choco Waffle**. The three restored products **Dragon, Beetroot and ABC** also lack
fallback mappings, giving **nine image gaps** in this 37-product candidate.

The other 28 original IDs have frontend Unsplash fallback mappings; verify each
URL loads, subject relevance, permitted use and actual rendering before launch.
They are references, not an asset backup. The active Banana Shake's Supabase public
image needs existence/ownership/bucket-policy verification if later approved for
staging; do not copy any signed URL or token. Its three archived peers lack images.
No image network fetch, Storage inspection or file copy was performed. Prefer
approved cafe-owned photos in the new project's reviewed public menu-image bucket.
Image upload/storage changes require separate approval and are outside this import.

## Validation and expected results

`verify_staging_menu.sql` expects 4 categories with positions 0/1/2/3; category
product counts 25/4/5/3; availability 23/4/5/3; 37 exact stable IDs; 69 variants;
no missing IDs, category or price differences; no orphan category links or duplicate
product-size rows; no Banana Shake copied. Review all 37 comparison rows, not just
total counts. Extra pre-existing products affect global counts and require review.
No URL-bearing query is included. Existing admin changes are deliberately retained
and shown as differences; never automatically 'repair' those after a rerun.

## Rollback and recovery

- Before commit: use ROLLBACK or allow an exception to abort the transaction; keep
  the target offline until it is closed. Numeric variant sequences may consume
  values even in rolled-back transactions. Gaps are harmless; do not reset them.
- If the connection drops before commit: reconnect only through an approved check
  and inspect the manifest IDs. Do not assume a client timeout means a commit failed.
- After commit: do NOT run broad deletes or remove referenced products. Preserve
  all records and source evidence. Keep the new staging target out of customer use,
  compare it, and prepare a separately reviewed corrective plan if needed. A new
  separate staging target is safer than destructive cleanup when state is uncertain.
- There is no automatic rollback deletion script, database reset or app connection
  switch in this proposal. Existing reference/testing projects and their financial
  history remain untouched throughout.

## Approval stop points

**A:** Review/approve this 37-product inventory, category order and Banana Shake
exclusion from the NEW target. **B:** Name and verify a separate staging project;
review schema, least-privilege access, offline operation and backups. **C:** Approve
an exact transactional dry run (which is write-capable despite final ROLLBACK).
**D:** Review results and separately approve a committed import. **E:** Independently
approve image work and customer-facing application configuration/deployment.

No database-changing action is authorized by this planning document. Do not execute
these files in either existing project's SQL Editor.
