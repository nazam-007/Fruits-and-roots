# Step 5: isolated database integration preparation

Current execution/cleanup guidance is superseded by
[Step 5B safety remediation](STEP_5B_INTEGRATION_SAFETY_2026-11-10.md).
Historical commands/results below are retained for audit; do not use the removed
test:integration:approved alias. Writing tests remain unapproved.

Deployment: ON HOLD. Target: `wznkpgpexjexxzptuuwp` only.

The user confirmed the testing project is disposable and contains no real records.
Earlier manually supplied migration results are evidence of schema configuration,
not a successful application connection. No database connection or write was made
in this preparation. Initial Git branch was main, with a clean working tree.

## Local configuration

An ignored `backend/.env.integration.local` has been created from the safe example,
with a fresh run UUID and blank credential fields. Existing `backend/.env` was not
changed. No credentials were copied from development. Do not paste secrets in chat.

Privately fill in:

- INTEGRATION_DATABASE_URL: use either approved direct mode or the approved session
  pooler below, port 5432, database postgres, and the corresponding restricted login.
  Fill the testing-only password privately; no URL query options. URL-encode password
  characters as needed.
- INTEGRATION_INSPECTOR_DATABASE_URL: the SAME host/port/database/project, using the
  testing project migration owner. This is an isolated test inspector, not API access.
- DATABASE_CA_CERT_PATH if the target needs its downloaded trusted CA. Place the
  certificate under ignored backend/certs. Otherwise Node's trusted roots are used.
  Certificate verification cannot be disabled; wrong CA/hostname must fail closed.
- INTEGRATION_SUPABASE_ANON_KEY: this project's client key, not its service-role key.
- INTEGRATION_AUTHENTICATED_ACCESS_TOKEN: a valid existing synthetic Supabase Auth
  user's access token from this testing project. Its validity is checked using GET
  /auth/v1/user; the runner does not create users or sign in to obtain tokens.

Do not change the normal backend DATABASE_URL or start the normal dev server.
The launcher reads development .env only to reject that project's identity. The
application target never falls back to DATABASE_URL. In CI without that file, supply
SHARED_DATABASE_URL as exclusion-only configuration. Neither URL is printed.

Direct mode and the single reviewed session-pooler endpoint are supported as of Step 5A.
Do not substitute any other pooler or disable TLS. The user manually provisioned a
testing-only password and enabled LOGIN; all elevated flags remained disabled. No
credential operation was performed by the agent.

## Read-only preflight

From backend: `npm run test:integration:preflight`.

The expected host depends on the explicitly configured method below. The launcher pins the project,
requires distinct development identity, a restricted application username, and matching
inspector endpoint. Both pools use the backend's verified TLS config. It checks actual
authorized TLS sockets, the database-facing hop (reported separately for poolers), restricted current_user flags,
empty application tables, session FORCE RLS and effective client session privileges.
Only metadata/counts are read. No records, hashes, tokens or URLs are printed.

For this FIRST RUN, all ten checked application tables must be empty; only the
migration-created restaurant_settings row is expected to exist. Any nonzero count
blocks writing tests even if records are synthetic. After a failed or successful run,
do not delete/truncate records or automatically rerun: inspect the preserved fixtures
and obtain a separate cleanup/new-environment approval.

The HTTP checks validate the client key and authenticated token before checking
GET /rest/v1/admin_sessions?select=token_hash&limit=0 denial for both roles. Responses
must be 401/403; no session records are requested. Missing client credentials report
configured=false and block the writing suite. A disabled Data API needs a separately
reviewed expected-response path, rather than treating an arbitrary 404 as a pass.

Expected preflight output: encrypted=true, certificateAuthorized=true, expected_role=true,
elevated flags=false, sharedProjectDifferent=true, all application counts=0,
sessionIsolation=true. markerReady may initially be false; that blocks writing tests.

## Separate disposable marker setup — NOT EXECUTED

The existing integration suite requires fr_test_control.marker. Migrations 000–015
do not create it. The inspector uses it as an extra write-safety gate. Preparing it
requires separately approved testing-only DDL and an INSERT, not another application
migration. No automatic setup is included. Before any such setup, review the target,
the run UUID in the ignored file, owner and an exact setup script. Do not execute
this illustrative setup without that approval:

```sql
CREATE SCHEMA fr_test_control;
CREATE TABLE fr_test_control.marker (
  run_id uuid PRIMARY KEY,
  disposable boolean NOT NULL CHECK (disposable)
);
-- Insert the exact privately configured INTEGRATION_RUN_ID after approval.
-- Do not copy development markers or grant client access to this schema.
```

## Exact writing command for future approval

Working directory: backend.

`npm run test:integration:approved`

Target: ONLY testing project wznkpgpexjexxzptuuwp, database postgres, port 5432;
use the explicitly reviewed direct or session endpoint below.
Runtime role: fruits_roots_backend. Inspector: testing owner, same target.

Before approval, leave INTEGRATION_ALLOW_WRITES and INTEGRATION_APPROVED_PROJECT_REF
blank. After the user separately approves this exact target and command, the intended
values are I_ACKNOWLEDGE_DISPOSABLE_ONLY and wznkpgpexjexxzptuuwp respectively. The
runner repeats all preflight checks before app startup and fixture writes. It runs
one serial test process, invokes no migrations, and performs no automatic truncation.

Writes include synthetic admin sessions, catalog/tag CRUD, a synthetic registered
table, checkout/order/payment records, expiry timestamps and the singleton schedule.
Fixture names/references include the run UUID prefix. Admin password and tracking
secret are generated in memory for this local process, not copied from development.
The inspector is used for preflight, rolled-back SQL role-denial probes and a synthetic
table fixture; customer/admin API operations use the restricted role. The final CRUD
scenario intentionally deletes unused synthetic catalog rows, archives an ordered
product and logs out the synthetic admin. Financial records are retained for review.
The settings end open/all-day. No real UPI transaction or gateway is contacted.

Prepared coverage: login/session/forged-token/unauthorized admin requests; SQL and HTTP
client session denial; catalog/tag CRUD and menu retrieval; Regular/Large server prices;
pending checkout; customer claim without self-confirmation; cancellation; expiry/late
reconciliation; same-order concurrent/idempotent verification; cross-order duplicate
reference race; paid New Orders visibility; tracking token/SSE; preparation through
completion; closed days/manual pause. Pending, cancelled and expired attempts are
asserted absent from operational orders. Live tests remain unexecuted.

## Results and limits

- Initial npm test attempt: 42 passed / 4 failed due to Node memory-allocation crashes.
- Serial database-free retry: 56 passed / 0 failed / 0 skipped.
- Backend production build: passed.
- Strict standalone integration-tool TypeScript check with --ignoreConfig: passed.
- Read-only preflight: initially refused missing .env.integration.local before connecting.
  The ignored placeholder file was then prepared; credentials remain blank.
- Real application/inspector TLS handshakes: not performed, credentials missing.
- Development/test project distinction: guard tests passed; actual configured identity
  comparison remains pending configuration/preflight.
- Real DB integration: 0 executed; awaiting configuration and explicit write approval.
- HTTP Data API authorization: not executed; client credentials missing.

No production readiness claim follows from mocked tests or catalog metadata. Remaining
release gates include actual-role integration, actual-connection TLS and negative TLS
endpoint tests, Storage policies/uploads, real browser flows, full payment/expiry/cancel
race coverage, staff independent bank-receipt verification, backups and deployment review.
No migrations, credential changes, shared DB writes, commits, pushes or deployment occurred.

Final follow-up checks: serial database-free suite again passed 56/56 after the final
port guard and authorization assertions; strict integration-tool type check passed.
Read-only preflight refused the prepared blank configuration before pool creation.
Git diff --check passed; no unmerged paths or conflict markers found in new files.
Five tracked files modified and five new tracked-candidate files are untracked; the
local secret template and certificate directory are ignored. No application routes,
frontend files, migrations or existing development configuration changed.


## Step 5A — session pooler support (10 November 2026)

No live preflight or database-writing integration test was run in this step. The
previous user-supplied psql results confirm a successful manual restricted-role
login using verify-full through the pooler, not an application-driver handshake.

### Approved endpoints and independent identity configuration

| Method | Host | Runtime username | Inspector username |
| --- | --- | --- | --- |
| session | aws-0-ap-northeast-1.pooler.supabase.com | fruits_roots_backend.wznkpgpexjexxzptuuwp | postgres.wznkpgpexjexxzptuuwp |
| direct | db.wznkpgpexjexxzptuuwp.supabase.co | fruits_roots_backend | postgres |

Both require database postgres and port 5432. Copy the actual endpoint details only
from the confirmed project's Connect panel. The session host alone identifies no
project: both exact username suffixes must agree with independently supplied
INTEGRATION_EXPECTED_PROJECT_REF AND the testing reference pinned in source.
The actual runtime connection must then authenticate as fruits_roots_backend and
report LOGIN=true, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE,
NOREPLICATION. Inspector access is intentionally owner access for metadata/counts,
never the role used for customer/admin API calls.

Privately update only the ignored backend/.env.integration.local:

```dotenv
INTEGRATION_CONNECTION_METHOD=session
INTEGRATION_EXPECTED_PROJECT_REF=wznkpgpexjexxzptuuwp
INTEGRATION_EXPECTED_HOST=aws-0-ap-northeast-1.pooler.supabase.com
INTEGRATION_EXPECTED_DATABASE=postgres
DATABASE_TLS_MODE=verify-full
```

Fill the two URL fields privately using the session usernames above and different
appropriate testing-role passwords. No real URL or password belongs in this report.
Keep DATABASE_CA_CERT_PATH pointing to the downloaded trusted CA when needed.
Preserve the run UUID and leave both write-approval fields blank. The existing
ignored local file and development .env were not read for secrets or edited in Step 5A.
The example was updated without copying or overwriting the local file.

The guard rejects missing passwords, unknown hosts/aliases, project mismatch in either
username, mismatched inspector endpoint, owner runtime login, port 6543/transaction
mode, URL query options/fragments, ambiguous usernames, unexpected method and insecure
TLS settings. Development identity is excluded across direct and pooler aliases.
Two different projects sharing a pooler hostname are not assumed to be the same DB;
the validated project identity is used for comparison instead. Unknown development
identity fails closed for remote testing. Direct host/role/port restrictions remain.

### TLS evidence and limits

Both pools use the same buildDatabaseConfig as backend pg initialization. It enables
rejectUnauthorized=true and TLS >=1.2 with trusted roots or the configured CA.
Both live sockets must report encrypted=true and authorized=true. No insecure retry,
plaintext fallback, certificate-verification bypass or guessed pooler host is added.

pg_stat_ssl describes the pooler-to-database hop, not the verified application-to-
pooler socket. Direct mode still requires its ssl flag true. Session mode reports
that flag separately and does not mislabel it as certificate validation. Provider
upstream certificate-validation guarantees must be reviewed separately for production;
this metadata query cannot prove them. This is an explicit transport distinction,
not an automatic downgrade after a failed TLS connection.

Official references reviewed:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/psql

### Exact manual read-only preflight command

In PowerShell:

```powershell
Set-Location -LiteralPath 'C:\Users\Nishat\Desktop\Full Stack Project\fruits-and-roots\backend'
npm run test:integration:preflight
```

Do not run test:integration or test:integration:approved. The preflight never imports
server.ts or creates fixtures. It checks role/required 33 table grants, schema USAGE,
legacy row-lock permission, four sequence USAGE permissions and prohibited reset/
privilege escalation/session mutation. It requires all ten application fixture tables
empty, validates session FORCE RLS and client isolation, and reports the disposable
marker. markerReady=false means writing tests remain blocked; no marker is created.
Data API denial probes are GET-only and require valid separate testing client inputs.

Expected sanitized output includes connectionMethod=session, project set to the
exact testing reference, sharedProjectDifferent=true, verified transport flags,
restricted role flags, requiredPermissions=true, sessionIsolation=true, all empty
counts zero and markerReady. No provider errors, credentials or URLs are printed.
Actual connection behavior, handshake and permissions remain UNVERIFIED until the
user manually runs this command and supplies its sanitized result.

Stop on target, credential, role, TLS, permission or empty-table failure. Preserve data
and logs privately; never fix a failure by changing grants, disabling TLS or rerunning
migrations automatically. Marker provisioning and any writing-suite execution still
require separate exact-target/command approval. Deployment remains ON HOLD.

Step 5A verification results: backend npm test completed with 59 passed, 0 failed,
0 skipped (npm ignored the attempted --test-concurrency option); npm run build passed.
Strict tsc --ignoreConfig --noEmit check of integrationRunner.ts,
database.integration.test.ts and integrationTarget.test.ts passed. git diff --check
passed; no unmerged paths. No live preflight or database-writing suite was executed.
Seven existing working files were updated in this step: integrationTarget.ts,
integrationTarget.test.ts, integrationPreflight.ts, integrationRunner.ts,
database.integration.test.ts, .env.integration.example and this report. Prior
uncommitted .gitignore/package.json/Data API helper changes were preserved.
Branch main; overall tree has five modified tracked files and five untracked files.
Backend production source/migrations, development .env and ignored local integration
credentials were unchanged. No database connection, credentials/role/grant/policy
change, migration, commit, push, merge or deployment occurred in Step 5A.

## Safe preflight failure diagnostics

The user reported a generic refusal after configuring Auth. No failing HTTP stage
can be inferred from that output. The runner now reports a fixed stage name and,
for Data API failures, only a fixed probe name plus HTTP status (or a generic
network/TLS/timeout label). It never prints provider errors, URLs, headers, tokens
or response bodies. HTTP redirects fail closed. Required success/denial statuses
remain unchanged. Database-free regression tests: 60 passed, 0 failed; strict
integration-tool TypeScript check and git diff --check passed. No live preflight,
Auth request, database write, credential/config change or migration was executed.
Next user action: manually rerun npm run test:integration:preflight and provide
only the sanitized stage/probe/status output. Preserve all authorization safeguards.

Data API 401 follow-up: a configured key alone does not establish why REST returned
401. Failure diagnostics now additionally emit only an allowlisted category:
key-rejected, key-missing, database-permission, jwt-rejected or unclassified.
Provider message/body contents are never printed, including diagnostic hints.
No status acceptance criteria were changed and no key rotation, grants, policy or
credential changes were made. No live request or writing test was executed.

## Credential validation correction

The user confirmed admin_sessions is unexposed, Data API is enabled, public is
exposed, and the same saved publishable key returns 200 from /auth/v1/settings.
The REST OpenAPI root's 401 cause remains unproven; do not claim unexposing the
table caused it. The checker now validates the client key using Auth settings,
validates the user token using /auth/v1/user, and still performs BOTH real session
route requests. It still requires 401/403; 200, 404 and server errors fail closed.
HTTP rejection does not distinguish gateway route blocking from SQL permission
denial, so the output records that limitation and both statuses. Separate SQL
privilege/RLS checks remain mandatory. No exposure, grants, RLS or keys changed.
Ten database-free guard/diagnostic tests passed; strict integration-tool TypeScript
check passed. No live requests or writing tests executed. The updated files are
the Data API helper, integrationTarget.test.ts and this report; prior changes kept.
