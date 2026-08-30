# ADR-006 — Amazon SQS and EventBridge for asynchronous work; no Redis

**Status:** Accepted · 2026-08-30

## Context

Several operations must not happen inside an HTTP request: synchronising products from
Dynamics AX, generating embeddings for tens of thousands of SKU, extracting attributes from
supplier PDFs, processing bulk imports and publishing to sales channels. They are slow,
bursty, and must survive a container restart.

The brief rules out Redis explicitly, and asks for SQS with EventBridge for scheduling.

## Decision

**Amazon SQS standard queues** for work distribution, **EventBridge Scheduler** for
time-based triggers, and no Redis anywhere in the platform.

- All jobs share one envelope, defined once in `@cdr/contracts`
  (`jobEnvelopeSchema`): `schemaVersion`, `jobId`, `type`, `correlationId`,
  `idempotencyKey`, `occurredAt`, `source`, `payload`. Producers cannot build one without
  a correlation id and an idempotency key — `buildJobEnvelope` is the only constructor.
- Job types: `AX_SYNC`, `AI_EMBEDDING`, `DOCUMENT_EXTRACTION`, `IMPORT_BATCH`,
  `CHANNEL_PUBLISH`, plus `SKELETON_PING` for the walking skeleton.
- Every queue has a **dead-letter queue** with a redrive policy (`maxReceiveCount`).
  **The worker never moves a message to the DLQ itself** — it either acknowledges, releases
  for retry with exponential backoff, or leaves the message alone once attempts are
  exhausted. One authority for that decision, and it lives in Terraform.
- A malformed payload raises `PermanentJobError` and is acknowledged rather than retried:
  retrying a message that can never parse only burns the retry budget and hides real
  failures behind noise.
- The queue is reached through `QueuePort` / `QueueConsumerPort` in `@cdr/messaging`, with
  `SqsQueueAdapter` and `InMemoryQueueAdapter` implementations.

**Standard queues, not FIFO**, because ordering is not a requirement here and idempotency
gives us the safety FIFO would; FIFO's throughput ceiling and message-group management would
be cost without benefit.

## Alternatives considered

**Redis + BullMQ.** Rejected — excluded by the brief, and rightly so at this scale: it adds
an ElastiCache cluster to provision, secure, patch and monitor, and a second durability
model to reason about. SQS is managed, has a DLQ primitive, and costs almost nothing here.

**Kafka / MSK.** Rejected. An event log is the wrong tool for a work queue, and MSK's
operational and cost floor is far above this project.

**RabbitMQ / Amazon MQ.** Rejected. Richer routing than we need, plus brokers to operate.

**Database-backed queue (`SELECT ... FOR UPDATE SKIP LOCKED`).** Genuinely tempting: no new
infrastructure, transactional enqueue with the business write. Rejected because the brief
specifies SQS, and because visibility timeouts, redrive policies, and DLQ metrics would all
have to be reimplemented and then operated.

## Consequences

- Producers and consumers share one validated envelope, so a schema change breaks the build
  rather than a production worker.
- `correlationId` flows from the browser's HTTP header into the worker's log records; a
  single identifier follows a unit of work end to end (verified in the walking skeleton).
- Retry and DLQ policy is declared in Terraform, visible in code review.
- Locally, `docker compose --profile aws up -d` runs LocalStack so the **real**
  `SqsQueueAdapter` is exercised — the same code path as production. `QUEUE_DRIVER=memory`
  remains available for unit tests and for working without Docker.
- The configuration schema refuses to start with `QUEUE_DRIVER=memory` when `APP_ENV` is
  `qas` or `prd`, because the in-memory queue loses messages on restart.

## Trade-offs

- **At-least-once delivery.** Every handler must be idempotent. This is a real, permanent
  constraint on handler authors, made explicit by the mandatory `idempotencyKey` and stated
  in `JobHandler`'s contract.
- **No ordering guarantee.** Two updates to the same product can be processed out of order.
  Handlers must be written to converge (e.g. embedding uses a content hash, so the last
  write reflects the current text regardless of arrival order).
- **Local development needs LocalStack** for full fidelity — an extra image to pull. It is a
  Compose profile, off by default, so it is opt-in.
- **Visibility timeout must exceed the slowest handler**, or SQS redelivers work still in
  flight. It is configuration (`QUEUE_VISIBILITY_TIMEOUT_SECONDS`) and it is easy to get
  wrong; the value is documented in `OBSERVABILITY.md` alongside the DLQ alarm.
