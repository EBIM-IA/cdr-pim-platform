# ADR-018 — Worker database secret and verified promotion

**Status:** Accepted · 2026-11-20

## Context

ADR-017 introduced asynchronous imports through the shared application runtime. The deployed
worker task still lacked `DATABASE_URL` and TLS configuration, so hosted startup refused the
new image and ECS rolled back. API and web had already been updated because the promotion
workflow did not verify the worker before updating its producer.

The operator explicitly authorized the worker to reuse the existing API PostgreSQL secret
in each environment. This is a narrow exception to ADR-004's separation of application
secrets; it does not authorize sharing other secrets or sharing credentials across environments.

## Decision

- When the worker has no database secret reference, copy only the API task definition's
  `DATABASE_URL` secret reference from that same environment, including its JSON selector
  and version. Never retrieve the secret value or place a connection string in plaintext
  task environment, source, logs or images. Preserve a valid worker database reference
  already configured by infrastructure.
- Preserve the worker's task role, execution role, network, queue, storage and other
  secrets. No IAM policy or security group is expanded by application promotion. A denied
  secret or database connection remains a deployment failure that requires an explicit
  infrastructure correction.
- Set `DATABASE_SSL=true` and the RDS CA bundle supplied in the worker image. Before
  starting health or SQS, the hosted worker checks the database connection, verified TLS
  and the required import schema with read-only queries. It exits with a sanitized error
  when the check fails.
- Prepare all task definitions from the revisions actually used by their services and
  validate them before migration or service changes. Keep immutable image digests and
  matching `APP_VERSION` values.
- Apply migrations, deploy the worker, then verify its expected revision, image, version
  and explicit ECS container health check. Update API/web only after that verification.
  Check all three services afterward; ECS stability alone does not prove that a rollback
  did not occur.
- Keep PRD manual, independently reviewed, and on the same images verified in QAS.

## Consequences

The worker receives database access for the existing import runtime without creating new
credentials. The existing database account may have broader SQL privileges than a dedicated
worker account; reusing it is the explicitly approved deployment choice. A dedicated account
can replace the reference through infrastructure later without changing this deployment flow.

Database availability is checked at hosted startup. Subsequent import failures still use
the existing idempotent execution and SQS retry policy. The startup check neither consumes
messages nor imports or modifies client data. A successful startup does not claim that an
end-to-end import batch has been executed.

Old rollback images may predate the startup probe. Their compatibility with the producer
and pending job types must be assessed separately; revision and health checks do not add
features to an old image.
