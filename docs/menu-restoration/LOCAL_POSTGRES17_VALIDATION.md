# Disposable PostgreSQL 17 validation — completed locally

No Supabase connections, protected-snapshot access, application startup, production
credential provisioning or real record changes. Existing Docker container
energy-postgres (617fc5287b67) remained stopped and unchanged. Docker Desktop was
started with approval; official postgres:17 image downloaded and retained as cache.
All owned validation containers and tmpfs test data were removed; no host ports,
network access or persistent/shared volumes were attached. No Docker prune/reset.

## Version and isolation
PostgreSQL 17.12 (Debian 17.12-1.pgdg13+1).
Official image digest:
postgres@sha256:846a7ddaa67a4b354ae1d21087b683901aa6113a4ed626d3787cfbf6c85e3e07
Harness: backend/tests/localPreviewSqlValidation.py. Explicit manual invocation,
not part of default tests; only docker exec Unix-socket psql against its uniquely
named/labeled network-none container. No .env/URL/remote-host access. Cluster data
mounted as tmpfs and deleted with only the verified owned container.

## Successful SQL execution, after sequence-check correction
Superuser-owner fixture: 11 test groups passed, 0 failed.
1. Six global default grant cases (PUBLIC/anon/authenticated x tables/sequences)
   refused, preserving existing schema-local ACLs on rollback.
2. MEMBER true / USAGE false / SET false validated for INHERIT FALSE SET FALSE;
   conservative global-default guard refused membership-derived grants.
3. Schema defaults removed, repeatable; future synthetic table/sequence private;
   unrelated managed-schema defaults unchanged.
4. Every one of five sequences tested both missing and wrong-kind (10 cases);
   transaction refused before ACL/RLS changes.
5. Both client roles lost table/sequence access including MAINTAIN; session RLS and
   FORCE enabled; service_role update access retained; isolation rerun succeeded.
6. Injected unexpected PUBLIC INSERT caused role/policy creation rollback.
7. Role flags, five policies and refusal on role-script rerun validated.
8. Actual preview login saw 36 approved unarchived products and 67 variants from
   37 approved synthetic products/69 variants with Banana archived. Extra unapproved
   product/variant invisible. Additional permissive PUBLIC policies did not broaden RLS.
9. Sensitive-table SELECT denied for orders/order_items/payments/admin_sessions.
   Writes denied even after explicitly disabling read-only inside synthetic transaction;
   sequence use denied. No original database write probes performed.
10. Exact runtime capability/relation metadata SQL passed as the actual preview login.
11. Exact exported parameterized menu query passed through category/variant RLS.

## Confirmed SQL defect corrected locally
Original sequence guard used relkind='S' AND has_sequence_privilege(...). PostgreSQL
reordered evaluation and called it for a TOAST relation, causing 'is not a sequence'.
Changed only invocation safety to CASE WHEN relkind='S' THEN has_sequence_privilege
(...) ELSE false END in proposed_preview_role.sql and previewPrivileges.ts. Security
conditions unchanged. Added database-free regression; 20 preview tests/build passed.

## Representative non-superuser owner: unresolved deployment blocker
A separate synthetic postgres owner was configured NOSUPERUSER CREATEDB CREATEROLE
BYPASSRLS REPLICATION, matching inspected Supabase flags, using a distinct bootstrap.
Results: 6 groups passed, 1 failed, 4 not reached. Defaults and client isolation passed.
Role creation transaction failed with 'Preview role must have no memberships or
members' and rolled back. PostgreSQL 17 automatically gives a non-superuser creator
ADMIN TRUE, SET FALSE, INHERIT FALSE membership in the created role. The current
SQL and runtime membership guards reject that normal administrative row.
https://www.postgresql.org/docs/17/role-attributes.html

Do NOT loosen the guard silently. Required separate local security review: permit
only an explicitly approved creator's ADMIN-only, NOINHERIT/NOSET membership, while
rejecting any outgoing preview memberships or other incoming memberships. Preserve
password-management/recovery authority; removing the creator's ADMIN option blindly
could prevent later private password provisioning. Alternatively obtain provider-
supported privileged provisioning; do not escalate postgres yourself. Align SQL,
runtime and tests, then rerun representative-owner PG17 validation before remediation.
No administrative-membership exception was implemented in this validation task.

One fixture-only setup attempt tried to demote the bootstrap superuser; PostgreSQL
correctly refused. Fixture was corrected to use a distinct bootstrap. That attempt
ran no proposal test groups and its container was removed. This was not a proposal
or production change.

## Decision
- Postgres default correction: GO to next approval review, local execution passed
  with representative non-superuser owner. Provider/event-trigger/default drift not modeled.
- Client isolation: GO to next approval review, representative-owner test passed;
  external consumer sign-off, fresh metadata drift and recovery remain required.
- Preview role / combined Supabase remediation: NO-GO until creator-administration
  membership handling is explicitly reviewed and representative-owner rerun passes.
No Supabase changes authorized. Supabase-managed extensions, API/Storage exposure,
TLS and provider-specific behavior are not validated by vanilla PostgreSQL fixtures.

Containers removed: fr-preview-pg17-5a5fd632226f, fr-preview-pg17-6a68fccb5c7a,
fr-preview-pg17-a8343af573e9, fr-preview-pg17-787b7accf908,
fr-preview-pg17-7fe747e41c57. No owned validation containers remain.

## Superseding compatibility review
The historical membership failure above is addressed by the narrowly scoped rule and follow-up validation in PG17_MEMBERSHIP_COMPATIBILITY.md. Supabase execution remains unapproved.
