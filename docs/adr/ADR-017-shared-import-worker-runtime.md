# ADR-017 — Share the import application runtime with the SQS worker

**Status:** Accepted · 2026-11-16

## Context

Import previews and row confirmation already have domain rules, optimistic locks, natural
keys and transactional audit in the API modules. The approved design also requires
asynchronous confirmation with durable progress. Copying those rules into a second
implementation would make synchronous and asynchronous imports diverge.

## Decision

The worker consumes the existing `IMPORT_BATCH` envelope through SQS, as required by
ADR-001 and ADR-006. Its payload contains only a batch identifier. A durable execution row
contains the actor accepted by the API, progress, timestamps, errors and an ownership lease.

`@cdr/api/import-worker` exports a small composition factory that wires the same application
use cases and persistence adapters. Importing it starts no HTTP server, authentication
module or environment loader. The worker depends on this package through the workspace,
so Turbo builds the API before the worker and `pnpm deploy` includes the compiled runtime.
The factory includes the configured additional application columns and the same homolog
identity policy used by synchronous confirmation.

The API's PostgreSQL outbox stores confirmation intent before dispatching `IMPORT_BATCH`
to `QueuePort`. Its timer only publishes messages and records successful dispatch; it
never performs import work or selects a next job for execution. Publishing before recording
dispatch may produce duplicates after a crash, which is safe. SQS remains the work queue,
visibility and retry authority. Worker visibility renewals protect long running jobs.
Execution claims use the batch named by the message, with leases shorter than initial SQS
visibility. Per-row progress renews the execution lease. An expired claim can be reclaimed
on broker redelivery; existing target natural keys and value/version checks prevent duplicate
relations or overwriting a changed attribute.

No remote AX, commerce or identity contract changes. Human product publication criteria
remain a separate pending decision.

## Consequences

- Confirmation returns HTTP 202 and can be followed after leaving or reopening the UI.
- PostgreSQL preserves intent even when SQS publication temporarily fails.
- The worker requires its own configured `DATABASE_URL` and refuses hosted startup without it; hosted database connections use
  verified TLS and the RDS CA bundle shipped in the worker image.
- Local cross-process acceptance uses `docker compose --profile aws up -d localstack`.
  Separate in-memory adapters do not communicate across API and worker processes.
- The synchronous confirmation endpoint remains available for existing callers. The API
  returns `executionMode`; local memory mode keeps synchronous confirmation, while SQS
  mode uses HTTP 202. The asynchronous endpoint rejects memory mode explicitly.
- The worker image contains the API package's transitive dependencies. A future extraction
  into a dedicated runtime package can reduce its size without duplicating business rules.

## Verification

`import-executions.spec.ts` covers concurrent claims, durable progress, expired ownership,
restart without duplicate relations, row failures and truthful monitor results. The opt-in
local acceptance script `scripts/verify-import-localstack.mjs` exercises the actual SQS
adapter, compiled worker handler and duplicate broker delivery against an isolated local
test database. It refuses non-local endpoints and database names without a test marker.
With `TEST_DATABASE_URL` and `LOCALSTACK_ENDPOINT` pointing to those isolated local services,
run `node scripts/verify-import-localstack.mjs` after the API/worker build and migrations.
Run the same command with `--retry` to claim a busy confirmation lease and verify real SQS
redelivery: the same broker message is received twice, published once, acknowledged once
and applies exactly two relations after recovery. The fixture and temporary queue are
removed on completion.

## Deployment configuration (before enabling asynchronous confirmation)

1. Apply migrations 0053 and 0054 with the normal migration task.
2. Configure the worker ECS task with the approved database secret (`DATABASE_URL`),
   `DATABASE_SSL=true` and the image's `DATABASE_SSL_CA_FILE=/app/certs/rds-global-bundle.pem`.
   Its security group must reach the existing PostgreSQL service. Do not copy database
   credentials into source or a task definition's plain text environment.
3. Deploy the worker that registers `IMPORT_BATCH` before the API producer. Both use the
   existing jobs queue, IAM permissions, redrive policy and DLQ alarms. Hosted startup is
   intentionally refused until the worker database configuration is complete.
4. Deploy the API/web, verify an approved local/QAS test batch, and check the durable
   execution state and row results. SQL migration alone does not demonstrate worker health.

This repository does not provision new credentials, change an external integration contract
or deploy ECS. The separate infrastructure repository owns those environment changes.
