# Final local security revisions — NOT EXECUTED

This review supersedes older combined-default and public-only runtime-check notes.
Latest corrections: defaults are additive for all object types; postgres proposal
refuses global table/sequence client grants and removes only public-schema additions.
Five role policies now include restrictive 37-ID product/variant guards generated
from the manifest, plus the existing backend allowlist. Prior statements that only
the backend enforces product IDs are superseded. No product records/prices change.
No database connections/SQL, credentials, environment changes or deployments in this task.

## Shared access model
A non-menu relation's SELECT grant is rejected when schema USAGE makes it reachable.
A grant to extensions.pg_stat_statements without extensions USAGE is tolerated; no
platform grants revoked and no extra schema USAGE granted. Table/column mutation
privileges including MAINTAIN remain forbidden even without schema USAGE. Sequence
SELECT/USAGE/UPDATE also remain forbidden. Cross-schema CREATE, database CREATE,
role memberships in either direction and reachable SECURITY DEFINER routines fail.
NOINHERIT does not erase PUBLIC permissions or permission to SET ROLE: memberships
must remain empty. Ordinary platform functions/catalog helpers/PUBLIC TEMPORARY are
not automatically revoked. No transitive function-source audit is claimed.

SQL proposal and startup now use this same model; pure database-free classification
and metadata-query tests cover it. Startup metadata helpers query catalogs only.
Preview HTTP paths/allowlist/normal application behavior are unchanged.

## Client isolation scope reviewed, unchanged
Ten named public application tables including sessions/financial tables, five named
application sequences. Revokes table AND column permissions from PUBLIC/anon/
authenticated; enables RLS and forces session RLS; rejects remaining inherited access.
Postgres owner/BYPASSRLS and service_role access retained. External REST/GraphQL/
Realtime jobs/direct-client dependencies need owner review. Existing policies are
not dropped, no rows or sequence values altered. Existing inspection found no
policies. restaurant_tables table is outside this ten-table scope; no new object
scope silently added. Its separately named ID sequence is in the reviewed five.
No changes to the retained Razorpay testing project.

## Split default proposals
proposed_public_default_privileges.sql now alters postgres defaults IN public only.
proposed_supabase_admin_public_defaults.sql is separately provider-authorized;
postgres must not escalate/grant itself platform membership to execute it.
Both leave auth/storage/realtime/vault/extensions/global defaults untouched.
Schema-scoped revokes cannot remove global/built-in PUBLIC function EXECUTE.
Each future application routine needs explicit per-routine revocation in its creation
transaction; no new public routines are currently planned. Other creators remain
subject to separate review. Defaults do not retroactively repair existing ACLs.

## Snapshot integrity and protected backup instructions — NOT RUN
Privately verified original snapshot SHA-256:
25f97e339581db0421ac96e94eaa1e5d04d909c9e49b246b37f830f38cded1b8
It contains both script result sets, recorded rollbacks and the repeatable-read
snapshot. No raw contents were logged or copied. Source remains in Windows Temp.
This is security-metadata recovery evidence, NOT a data backup/executable rollback.

After separate approval, run the following locally in PowerShell; do not upload results:

```powershell
$sourceSnapshot = 'C:\Users\Nishat\AppData\Local\Temp\fr-security-snapshot-SZsOHw\complete-security-snapshot.json'
$backupFolder = Join-Path $env:LOCALAPPDATA ('FruitsRoots\SecuritySnapshots\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$backupFile = Join-Path $backupFolder 'complete-security-snapshot.json'
$expectedHash = '25f97e339581db0421ac96e94eaa1e5d04d909c9e49b246b37f830f38cded1b8'
if ((Get-FileHash -LiteralPath $sourceSnapshot -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Snapshot hash mismatch; stop' }
New-Item -ItemType Directory -Path $backupFolder -ErrorAction Stop | Out-Null
$accountName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls.exe $backupFolder /inheritance:r /grant:r "${accountName}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict backup permissions; stop' }
if (Test-Path -LiteralPath $backupFile) { throw 'Backup exists; stop without overwriting' }
Copy-Item -LiteralPath $sourceSnapshot -Destination $backupFile -ErrorAction Stop
if ((Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Backup integrity check failed' }
Write-Host 'Protected backup verified; contents not displayed.'
```

Keep outside Git/cloud-shared folders. NTFS ACL restriction is not encryption at
rest: use a managed encrypted device/volume and protect Windows account access.
Do not delete original snapshot until backup integrity and readability confirmed.
Policy expressions/ACLs are private metadata. Preserve grantors/grant options and
NULL-default meaning. Reconstruct recovery SQL only after approval; never broadly
restore unsafe session/financial client grants.

## Required before public menu preview
1. Preserve protected snapshot; confirm no dependency on removed direct client grants.
2. Approve/apply existing client isolation, including unsafe financial/session and
   sequence privileges. These existing exposures should not wait for payment launch.
3. Approve/apply postgres public-default correction before future application DDL.
4. Approve/apply passwordless preview role with verified isolation; separately approve
   private password provisioning and read-only actual-role verification. No live write
   probes on original records. Keep existing broad postgres out of preview service.
5. Recheck same role metadata on Render and negative TLS/config tests in an isolated
   environment. Use only start:preview, matching VITE_MENU_PREVIEW and HTTPS origins.
6. Resolve/explicitly assess upstream TLS, deploy only after separate approval;
   menu-only GET endpoints, no credentials/payment/admin routes in frontend.

## Can wait for full ordering/payment release
- Razorpay 016/live gateway work, checkout/admin mutations, broad backend runtime role,
  order/payment concurrency tests and missing-menu inserts are not needed for text preview.
- Storage/image changes can wait while preview is text-only.
- supabase_admin public-default correction may be scheduled with provider support
  IF no public application objects are created by that role in the interim, change
  monitoring/owner approval are recorded, and existing unsafe grants are removed.
  This is a conditional deferral, not a claim those defaults are fixed. If future
  creator activity cannot be controlled/reviewed, it remains a preview blocker.

## Transaction/recovery/approval order
Each SQL file is independent BEGIN/COMMIT with timeouts. Errors roll back that file;
a later file does not roll back earlier commits. Defaults/client revokes are repeatable
for reviewed objects; role/policy creation intentionally refuses existing names.
Never drop or repurpose a conflicting role. Freeze concurrent DDL/grant edits while
comparing snapshot and executing approved revision. Target must independently match
mrjsfznxbwjsdzyuzvsi; filenames/comments do not validate connection identity.
Approve: local revision review -> protected backup -> dependencies/change window ->
postgres defaults and client isolation -> preview role -> password and read-only
verification -> separate provider default correction/recorded deferral -> Render
configuration/TLS -> explicit deployment. No execution approval inferred here.

## Verification
Preview regressions after latest SQL corrections: 19 passed, 0 failed. Existing backend suite: 133 passed, 0 failed. Backend TypeScript build passed.
No database execution, actual new-role permissions or deployed TLS verification claimed.
SECURITY_REVISION_DIFF.patch records the earlier runtime/default split revision.
Latest exact SQL is in EXACT_SECURITY_SQL_REVIEW.md; latest changes/limits are in
FINAL_SQL_CORRECTIONS_REVIEW.md. The earlier patch is historical, not current SQL.
