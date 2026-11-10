# Step 5B — integration safety remediation

Status: STOP for a new code-grounded safety review. No execution approval is inferred.
Deployment remains ON HOLD. Only testing project wznkpgpexjexxzptuuwp is supported.

Final concurrent-payment analysis: supplied read-only results show three retained
orders still PENDING_PAYMENT, payments respectively PENDING_VERIFICATION/CANCELLED/
PENDING_PAYMENT, no verified reference/verifier/time, and no reconciliation flags.
No confirmation or reconciliation persisted. This does not distinguish a failure
before transaction start from rollback, timeout, constraint or transport failure.
Current pending status alone does not prove the original deadline was still active.

Added database-free real-route tests using a simulated transactional row-lock queue:
two concurrent same-reference requests return 200/200 and commit one update pair.
Injected 55P03 lock timeout, 57014 statement cancellation and 40P01 deadlock failures
roll back and return 500/500; injected 23505 returns 409/409. These demonstrate safe
route handling, not actual PostgreSQL concurrency or the historical root cause.
Focused route/safety checks: 73 passed, 0 failed, 0 skipped. Production payment
logic, locks and constraints were not changed.

The application pool defaults to ten clients; verification leases one transaction
client and does not request another while holding row locks. The dedicated advisory
lock uses another pool and is not a row lock on orders/payments. With no external
writer, two requests to the same row serialize rather than form a circular lock
dependency. Pooler-side limits, outside blockers and historical configuration are
not established by local configuration. Current integration limits remain 10s
acquisition, 12s statement, 5s lock wait, 10s idle transaction, 15s HTTP timeout.
The expiry worker is not automatically started by importing the test app. An expired
verified receipt would normally create reconciliation evidence, absent here, unless
its transaction itself failed. Do not weaken expiry checks or increase timeouts on
that hypothesis.

Next boundary: obtain original safe HTTP/SQLSTATE logs if available. Otherwise use
a separately approved clean disposable environment with the retained diagnostics,
fresh preflight and explicit single-run approval. Keep existing financial records
and journal. A new project requires reviewed pin/configuration/provisioning changes;
none were performed. No live query or writing integration test ran in this analysis.

Concurrent UPI diagnostic follow-up: the preserved journal ends after two same-order,
same-reference verification requests, without successful response IDs, then records
settings-restored. The original request statuses/provider codes were not saved, so
an application, constraint, timeout or transport root cause cannot yet be asserted.
The endpoint locks both order/payment rows in one transaction and returns idempotent
200 for an already-paid matching reference. Thus two 200 responses are the intended
test expectation; the verified-reference unique index remains unchanged.

The integration HTTP helper now records verification response status before its
expected-status assertion. Both concurrent attempts retain independent status and
allowlisted failure category in journal events and aggregated diagnostics. Unknown
client failures remain failures; no response bodies, references, cookies or tokens
are journaled. A 500 remains server-error, not an invented database SQLSTATE.
The previous Promise.allSettled/every-fulfilled assertion discarded both rejected
reasons, and status assertions occurred before successful-response journaling.
No original journal was changed and no database was contacted. Targeted read-only
inspection of the three journal-owned order/payment rows and the unique index is
the next approval boundary; a populated target must not be used for a full rerun.

Setup-stage diagnostic follow-up: writing-suite setup failures now preserve their
static preflight/setup label through error aggregation. No security gate changed.
A subsequently observed local run journal contains catalog/order mutations and a
final settings-restored event. This differs from the earlier Auth-rejected attempt
that created no journal. Do not assume the target is still empty, rerun against it,
delete the journal or erase financial history. Live state and the exact failed
setup check require separately approved read-only investigation; none was run here.

Write-gate diagnostic follow-up: local-only validation confirmed the target passed
but all three approval fields were empty. The runner now separates project/endpoint
validation from write approval validation and reports the missing/mismatched field
name without echoing its value. All gates remain required; no approvals were filled,
no local configuration changed and no live connection or writing test was run.

Authenticated-token 403 investigation: both preflight and writing suite call the
same verifyDataApiDenial helper. /auth/v1/user requires HTTP 200; its 403 is NOT
an expected admin_sessions permission denial. The classifier previously inspected
PostgREST code/message but omitted Auth error_code/msg. It now recognizes documented
bad_jwt and session/user-invalid codes for sanitized diagnostics, while rejecting
every non-200 token-validation response, including PostgreSQL permission-shaped 403s.
Unknown responses remain unclassified and rejected. No new successful denial case
or HTTP acceptance rule was added.

At inspection, the local JWT metadata matched the testing issuer/authenticated role
but its expiry had passed. This is local, unsigned metadata evidence only; the raw
failed response and execution timestamp were not captured, so the exact earlier
Auth rejection cause is not proven. No integration-artifacts directory/journal was
present. The reported failure precedes backend import/startup, journal creation,
settings capture and application DML. No application writes or settings restoration
are expected on that path; session timeout configuration and advisory locking can
have occurred. No database was contacted in this investigation. Refresh the testing
user token privately, rerun read-only preflight, then obtain fresh approval for any
writing rerun. Do not reset a journal or alter RLS/grants to address this Auth error.

Auth response references: https://supabase.com/docs/guides/auth/debugging/error-codes
and https://github.com/supabase/auth/blob/master/internal/api/middleware.go.

Session-pooler timeout follow-up: user-supplied preflight evidence showed an
effective statement_timeout of 2min despite the configured 12s startup parameter.
Integration pools now use pg-pool's awaited onConnect hook (confirmed in the
installed implementation) to apply session-only set_config limits and read them
back before leasing each new connection. Failed initialization/verification rejects
and destroys that connection. This covers application, inspector, probe and lock
pools through their shared configuration. Normal connections are unchanged.
These are ephemeral session settings, not ALTER ROLE/DATABASE or migrations.
No live connection or SQL was executed while preparing this correction. Existing
preflight timeout checks remain mandatory and unchanged.

Preflight diagnostic follow-up: the read-only runner now reports the exact static
check label (connection/startup, TLS, individual server timeout, grants, table
count, fixture, isolation or marker) rather than only the combined database stage.
Labels contain no configuration values, SQL parameters or raw provider messages.
No gates were changed and no live preflight was executed for this update.

## Step 5F — failure preservation and database limits

The suite now retains sanitized primary test/setup failures first in an
IntegrationFailure (AggregateError), with cleanup aggregates separately following.
Individual subtests also sanitize their failures before node:test prints them.
Raw error messages, provider stacks, causes, credentials and SQL parameters are not
retained in these diagnostic objects. Trusted stage labels and an allowlist of
SQLSTATE codes provide diagnostics. Failed test/cleanup paths fail node:test and
therefore the canonical command; the shared timeout after hook also reports cleanup
failure. Settings restoration errors survive subsequent pool closure failures.
Every independent inspector/preflight closure is attempted and its error retained.

The internal INTEGRATION_DATABASE_SAFETY_LIMITS=enabled setting is forced by the
runner and suite; operators need not edit local configuration. It activates fixed
limits in buildDatabaseConfig for all integration application, preflight, inspector
and dedicated-lock connections, including the application's imported db pool:

| Limit | Value | Enforcement |
| --- | --- | --- |
| Connection/pool acquisition | 10 seconds | pg connectionTimeoutMillis |
| SQL statement | 12 seconds | PostgreSQL statement_timeout startup parameter |
| Database lock wait | 5 seconds | PostgreSQL lock_timeout startup parameter |
| Idle transaction | 10 seconds | PostgreSQL idle_in_transaction_session_timeout |
| Advisory run lock | Immediate try-lock | Existing pg_try_advisory_lock |

Preflight reads effective server settings on both restricted and inspector
connections; unsupported/ignored pooler startup parameters fail closed before
writes. No role ALTER, migration or persistent database setting is executed.
Normal development/production configurations retain their existing behavior when
this internal integration mode is absent. Invalid nonempty mode values are refused.
The 12-second statement limit is below the existing 15-second HTTP timeout; intended
short payment verification races remain concurrent, with the loser still subject
to normal transaction/uniqueness semantics. Live timing is not proven here.

No client query_timeout is used: rejecting a client promise does not establish
that PostgreSQL stopped execution. Network failure, leaked clients or broken
transport can still prevent drainage despite server-side limits. No timeout race
unlocks the database in that condition. Investigate the journal and active sessions;
do not start another run merely because a killed/disconnected session released its
lock. Forced termination and end-to-end TLS limitations remain as documented.

Safe teardown order remains HTTP stop, actual test-body drainage, HTTP closure,
revision-guarded settings restoration, application pool drainage, other pool closure,
and finally unlock on the original session. Restoration failure alone does not
prevent safe resource closure/unlock, but failed quiescence or pool closure does.
Fixture provisioning remains a separate approval; no fixture or live test was run.

Step 5F database-free verification: backend npm test 85 passed / 0 failed /
0 skipped, including 23 dedicated safety tests; backend production build passed.
Strict integration TypeScript and Git whitespace checks passed. No development
configuration, credentials, migrations or Supabase state changed.

## Step 5D — ordered advisory-lock teardown (10 November 2026)

Supersedes the separate teardown hooks described below. A single memoized shutdown
promise is shared by the suite's finally and node:test after hook (including timeout).
The shutdown sequence is:

1. Mark ingress stopped and call HTTP server.close() to stop accepting connections.
   Test-only ingress rejects requests after shutdown/abort. After five seconds,
   closeAllConnections() terminates lingering HTTP sockets, including SSE.
2. Await completion of the suite body. Aborted contexts refuse later requests and
   subtests. Socket/client abort is not assumed to cancel PostgreSQL work.
3. Await HTTP closure, then attempt the existing revision-guarded settings restore.
4. Await application db.end(): checked-out connections must drain and new pool work
   is refused. Close the read-only inspector and preflight pools.
5. Only then unlock on the original dedicated PostgreSQL session, release that
   client, and close its separate one-connection lock pool.

Settings restoration failure is reported after resource drainage and unlock;
its recovery journal remains authoritative for manual investigation. Failure of
any quiescence/resource barrier prevents explicit unlock. Shutdown is not retried
by a second hook. Database drainage is deliberately not raced against a timeout
that could release the lock with active work; an unreachable/stuck operation can
therefore leave shutdown waiting and require operator investigation.

Forced process termination, machine failure or loss of the dedicated lock session
cannot preserve an advisory lock: PostgreSQL releases session locks on disconnect.
Other database sessions might still have work in progress. Never start a replacement
run merely because the lock becomes available; inspect activity, retained synthetic
records and the recovery journal first. Lock connection loss still stops the process.
No guaranteed rollback or settings restoration is claimed for those events.

Database-free teardown tests cover ordering, shared timeout/finally execution,
pending database drainage, barrier failures, restoration failure, assertion failure,
aborted contexts and unlock failure. All three approval gates, target/exclusion,
marker, restricted role and certificate-validation checks remain in place.
No Supabase connection, SQL, fixture, migration or writing test was executed.

Step 5D verification: npm test 78 passed / 0 failed / 0 skipped (nine new
teardown/abort tests); strict standalone integration TypeScript check passed;
backend production build passed. Cancelled subtest bodies are explicitly awaited
even if node:test has already completed cancellation bookkeeping.

## Canonical command and approvals

From backend, the only npm writing entry point is `npm run test:integration`.
It calls integrationRunner.ts run, which reads the ignored .env.integration.local,
validates the project/exclusion/TLS configuration and requires these exact fields:

| Field | Required value | Treatment |
| --- | --- | --- |
| INTEGRATION_ALLOW_WRITES | I_ACKNOWLEDGE_DISPOSABLE_ONLY | Explicit write approval; clear after use |
| INTEGRATION_APPROVED_PROJECT_REF | wznkpgpexjexxzptuuwp | Exact project approval; clear after use |
| INTEGRATION_EXCLUSIVE_ACCESS_CONFIRMED | NO_OTHER_APPLICATIONS_OR_TEST_RUNNERS | Operator attestation; clear after use |
| INTEGRATION_TABLE_FIXTURE_ID | Positive decimal bigint ID returned by approved separate provisioning | Nonsecret fixture identity, not approval |

Keep all approval fields blank pending review and explicit authorization. No ignored
configuration or secret was changed in remediation. The historical
test:integration:approved alias has been removed. npm test lists only database-free
tests. Direct execution of database.integration.test.ts throws, rather than silently
skipping when configuration is absent. The exported suite independently rechecks
approvals and target before opening pools. No production/local targets are accepted.

The wrapper now registers the suite in the same Node process. There is no raw child
test command that bypasses wrapper configuration loading. The environment is sanitized
before importing the suite/backend; development DATABASE_URL remains exclusion-only.
Neither a marker nor an environment string substitutes for actual human approval.

## Order before writes

1. Read ignored configuration, require approvals and validate both endpoint identities.
2. Create TLS-validating pools. Inspector config sets default_transaction_read_only=on.
3. Lease a dedicated restricted-role session, check role/TLS, acquire the fixed
   database advisory lock with pg_try_advisory_lock(1718775654,505).
4. Repeat complete preflight while that lock is held: target role/grants/TLS,
   empty fixture tables, exact pre-provisioned table fixture, session isolation,
   marker and valid anonymous/authenticated HTTP denial checks. Recheck marker.
5. Start the isolated loopback backend. Create an exclusive local JSONL recovery
   journal for the full run UUID and capture the existing settings singleton.
6. Execute sequential fail-fast tests. Payment verification race requests remain
   concurrent within their individual test and are awaited with allSettled.
7. In finally, attempt revision-guarded settings restoration. Teardown closes pools
   and server; the dedicated session unlocks on teardown/session closure.

Both approvals are checked again in integrationSuite. A missing URL now fails in
the wrapper instead of yielding a successful skipped test. Invalid or stale credentials,
unexpected records, fixture/marker mismatch, TLS or permission failure stops writes.

## Registered-table fixture: separate approval required

The suite performs NO committed inspector writes. It no longer inserts a
restaurant_tables fixture or attempts INSERT/UPDATE/DELETE through inspector probes.
It checks actual SELECT denial under each client role in BEGIN READ ONLY, while
the preflight still checks all prohibited table/column write privileges through
metadata. This is narrower runtime DML-denial coverage, explicitly disclosed.

Before the writing suite, separately review/approve one owner-provisioned row in
the confirmed testing project. Proposed SQL only; not executed:

```sql
INSERT INTO public.restaurant_tables (table_number, is_active)
VALUES (
  'T' || left(replace('c69f68c8-e5b7-4a58-85cd-29c68072abed', '-', ''), 19),
  true
)
RETURNING id, table_number;
```

Use the actual INTEGRATION_RUN_ID if it changes. Save the returned ID privately as
INTEGRATION_TABLE_FIXTURE_ID. No grants, schema migration or password change is needed.
The table_number length is capped at the verified VARCHAR(20); the ID/full UUID
mapping is recorded in the journal. The fixture ID, derived number, active flag and
total restaurant_tables count=1 must ALL match. Every other application fixture
table must be empty. No arbitrary pre-existing tables are accepted. This one row is
an explicit exception to the old all-ten-counts-zero report label.

If no fixture is configured, read-only preflight can report tableFixtureReady=false
with zero tables; the writing suite refuses to proceed. After provisioning exactly
that fixture, expect count 1 and tableFixtureReady=true. Do not provision automatically
or assume prior marker approval covers the fixture.

## Settings restoration and concurrency conflicts

captureSettings reads id=1 and records accepting_orders, complete opening_hours,
the exact updated_at text and PostgreSQL xmin revision before tests modify it.
Missing singleton fails closed. A restricted-role fixture helper updates values
with WHERE id=1 AND xmin::text=expected_revision and stores the returned revision.
The finally path restores original values/timestamp only if its last revision still
matches. If another process changed the row, restoration fails and preserves that
process's values rather than silently overwriting them. xmin itself necessarily
changes; it is a revision guard, not a value that can be restored.

Because the production PATCH route has no compare-and-set version input, settings
fixture mutations now use restricted SQL and public menu/status GETs. Production
routes were not modified. This suite no longer claims to test the admin settings
PATCH mutation; that remains a separately identified coverage gap. Database-free
API tests do not replace that future real-DB coverage.

Network failure can make commit outcome uncertain. The helper marks restoration
necessary BEFORE issuing an update; if it cannot establish the current revision it
will not blindly restore. Normal assertion failures run finally. Forced kill, machine
failure, lock-connection loss or unreachable DB cannot guarantee restoration. On lock
connection loss the process terminates, preserving evidence and stopping future writes.
Inspect the recovery journal before any manual action. There is no unsafe retry loop.

## Run records, cleanup and audit preservation

The complete run UUID appears in synthetic customer/admin names, catalog names and
verification references where field lengths permit. Claims include run UUID plus
order UUID. The 20-character legacy table number is the documented exception.

Ignored backend/integration-artifacts/<full-run-uuid>.jsonl records:
- Full run identity and separately approved fixture ID.
- Initial settings and known settings revisions/restoration outcome.
- Mutation method/path and checkout idempotency keys before requests.
- Returned entity/order IDs, never entire HTTP responses.

No passwords, session cookies, tracking tokens, user access tokens or connection
strings are recorded. The file is opened with wx: an existing journal refuses run-ID
replay instead of overwriting audit evidence. mode 0600 is requested; Windows privacy
also depends on the user's existing NTFS ACLs. Do not share this artifact broadly.

The existing final CRUD test deletes only unused product/variants/category IDs
created by this run, removes the created tag (cascading its associations), archives
the ordered product, and logs out the synthetic admin. Foreign-key order is
variants/unused product before its unused category; tag associations cascade.
No order, item or payment audit rows are deleted. The registered table remains.
This is partial scenario cleanup, NOT whole-suite rollback or guaranteed cleanup
after failure. No automatic failure cleanup removes evidence or guesses ownership.

Every individual API commit remains committed after later assertion failure. A
request can commit before its response/ID reaches the journal. Names and checkout
idempotency keys help investigation but are not an excuse for broad deletion.
Never delete financial records or any row without positive ownership identification.

Safe rerun strategy: do not rerun a populated database or delete a journal to force
execution. Preserve synthetic audit evidence. Prefer separately approved recreation
of the disposable database/project over uncertain cleanup. If a new project reference
is issued, a new reviewed pin/configuration/marker/credential setup is required.
Any owner cleanup, restore or recreation is outside this implementation and approval.
Never TRUNCATE, DROP TABLE, reset sequences or use unrestricted DELETE.

## External access and residual TOCTOU

The advisory lock is database-wide across cooperating runners and different run IDs,
not merely process-local. It requires a dedicated direct/session connection and is
not supported through transaction pooling. PostgreSQL releases it when that session
ends. A local exclusive journal adds replay protection on this checkout only.

Advisory locks do NOT block unrelated applications, SQL Editor writes or malicious
clients. The new explicit attestation requires the operator to stop other backends,
test runners and manual mutations first. Supabase internal platform sessions can
exist; pg_stat_activity alone cannot prove the absence of pooled external clients.
No grants, network rules or production behavior were changed to enforce exclusivity.
Do not set the attestation if the target is shared or exclusivity cannot be established.

Original application behaviors still include deleting ALL expired admin sessions on
login and bulk expiry of ALL overdue pending orders/payments. They are status/time
scoped, not run scoped. They are safe only under this isolated first-run/exclusive-
access contract; preflight is not a permanent guarantee against later external writes.
Concurrent payment requests within the suite do not release the global run lock.

## TLS investigation

Client-to-pooler certificate-validating TLS remains mandatory. Reported upstream
ssl=false is not changed or relabeled as secure. Direct PostgreSQL connectivity
with verify-full avoids the intermediary hop and can provide a verifiable single
TLS route, from a working IPv6 network or separately purchased/configured IPv4
direct endpoint. Neither was provisioned/tested here. Hosted Supavisor upstream
settings cannot be changed by this runner; open-source upstream_ssl documentation
does not establish the hosted project's configured guarantees.

References reviewed:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.github.io/supavisor/configuration/tenants/

Retain this as a production blocker until resolved/formally assessed. Synthetic,
nonfinancial testing still transmits testing credentials/records; accepting that
upstream limitation requires explicit risk awareness. No end-to-end TLS claim,
certificate bypass or insecure fallback is introduced.

## Verification and review gate

Database-free checks run: npm test, npm run build, strict standalone TypeScript
checks of runner/suite/guard/safety tests, and git whitespace/conflict review.
No live preflight, Auth request, advisory lock, fixture provisioning, migration,
settings update or writing integration suite was executed in this remediation.

Before execution: obtain a new safety review, approve separate fixture provisioning,
verify exclusive access, refresh the short-lived Auth token if needed, rerun read-only
preflight manually, and obtain explicit approval for the exact canonical command
and synthetic scope. Keep approval fields blank until then.

Final database-free results: npm test 69 passed / 0 failed / 0 skipped (includes
7 dedicated integrationSafety tests and 10 target/diagnostic tests); npm run build
passed; strict standalone TypeScript check of runner, suite and safety/target tests
passed. git diff --check passed; no unmerged paths. No production application source
or migrations changed. Starting uncommitted work was preserved. Final overall Git
status: main; five modified tracked files and eight untracked files. Integration
local secrets and artifacts are ignored. No live preflight, database connection,
SQL/fixture/migration execution, credential change, commit, push, merge or deployment.
