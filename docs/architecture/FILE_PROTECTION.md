# File protection and cleanup

Uploads to product documents, images and PDF catalogs pass through the scanning
storage adapter before S3 receives their bytes. ZIP import commits use the same
gate for each persisted entry. Format, MIME and size validation still applies.

`MALWARE_SCAN_DRIVER=clamav` is mandatory for hosted API configurations. Configure
`CLAMAV_HOST`, `CLAMAV_PORT` and `CLAMAV_TIMEOUT_MS` (maximum 30000). The daemon must
use `TZ=UTC`: its VERSION reply carries the signature build date without a zone.
Missing, malformed, future or older-than-seven-day metadata blocks the upload.
Detection returns a validation error; an unavailable or unsuccessful scanner
returns a dependency error. Neither case stores the rejected file. Direct
presigned uploads are blocked through this adapter.

## Runtime

Promotion applies `scripts/configure-api-file-protection.py` to the API task
definition. The official ClamAV 1.5.4 image is pinned by digest and runs beside
the API on the same task. The listener binds to `127.0.0.1:3310`, without a port
mapping. The API waits for the scanner's health check. The scanner has a 4096 MiB
hard memory limit; the task reserves at least 6144 MiB and a compatible Fargate
CPU size, preserving larger existing allocations. Health checks require an actual
PONG reply from IPv4 loopback, matching the API connection without relying on
how the container resolves `localhost`. This increases runtime
capacity compared with an API-only task.

FreshClam checks for updates twelve times daily. The container includes initial
definitions and updates them without rebuilding the application. Before the
official `/init` starts the daemons, `scripts/start-clamav.sh` runs one synchronous
FreshClam update. This also refreshes databases already embedded in the pinned
image: the upstream launcher otherwise updates those concurrently with ClamD,
which can exit first when the embedded signatures are older than seven days.
The one-shot configuration suppresses only `NotifyClamd` while no scanner exists;
database validation remains enabled and the ongoing updater uses its original
configuration. An update failure prevents daemon startup. `FailIfCvdOlderThan=7`
and the application's seven-day metadata check remain enforced.

ECS embeds this exact checked-in launcher in the task definition. The running-task
checker accepts only that entrypoint and command, with the pinned image and
private health-checked listener; arbitrary startup overrides are rejected.
Compose and the real-engine CI gate mount the same launcher read-only. Scan limits are explicit:
64 MiB per file/stream, 256 MiB expanded data, 1000 files, recursion depth 16 and
20 seconds engine time. Inputs exceeding limits or containing encrypted data
are rejected by the configured engine. Two scan threads and non-concurrent
database reloads limit memory pressure.

The sidecar uses the existing task's AWS logging configuration with its own
stream prefix. It requires outbound access to the official signature service.
No public bucket access, new IAM role, security group or externally reachable
scanner endpoint is created by the application deployment.

## Cleanup policy

CDR selected **30 days** on 23 October 2026. Cleanup starts this grace period
when it observes a managed object without a reference. Historical objects with
unknown retirement dates receive a full grace period from reconciliation.

- Preserve the current file of every catalog, including deleted catalogs that
  can be restored, inactive catalogs and expired catalogs.
- Preserve active product asset files.
- Consider replaced files, retired product assets and upload orphans only after
  the grace period and a fresh reference check.
- Restrict inventory and deletion to recognized application file key formats.
  Other bucket contents are outside the cleaner's scope.
- In versioned buckets, remove eligible object versions and delete markers by
  identity. A new delete marker does not count as physical cleanup.

`FILE_CLEANUP_ENABLED=true` enables the API maintenance scheduler. The default
interval is one hour (`FILE_CLEANUP_INTERVAL_MS=3600000`), with inventory pages
of 50 objects (`FILE_CLEANUP_PAGE_SIZE`) and at most 20 pages per namespace per run
(`FILE_CLEANUP_MAX_PAGES`). Inventory cursors, grace periods and cleanup outcomes
are durable. Multiple API tasks coordinate through a database lease. Per-object
database locks are shared with file-reference writers, which check that the
object still exists before committing.

The task role needs bucket inventory/versioning inspection and physical deletion
rights for the configured private asset bucket. Depending on bucket versioning,
this includes `s3:GetBucketVersioning`, `s3:ListBucket`,
`s3:ListBucketVersions`, `s3:GetObject`, `s3:GetObjectVersion`,
`s3:DeleteObject` and `s3:DeleteObjectVersion`. Scope these in the infrastructure
repository to the actual bucket and managed prefixes. The application does not
grant itself permissions. Missing rights produce a failed maintenance run,
rather than silently treating a delete marker as reclaimed storage.

Cleanup does not hard-delete catalog metadata or audit history. Enabling scan
protection applies to new writes; it does not retrospectively certify old files.

## Verification

Unit tests exercise ClamD framing, limits, stale signatures and storage gating.
PostgreSQL integration tests cover persistent retention and reference locking.
CI also runs the pinned real engine against a clean file and the harmless EICAR
standard test file. Run that check locally with:

```sh
docker compose --profile security up -d clamav
pnpm --filter @cdr/storage... build
node scripts/verify-file-scanner.mjs 300
```

The command checks clean-file storage, real EICAR detection, failure when the
daemon is unavailable and rejection of direct writes that bypass scanning. It
prints only pass/fail flags, without file contents or credentials.

See [ADR-016](../adr/ADR-016-file-scanning-and-object-retention.md) for the
decision and its limits, and the [official ClamAV protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
for streaming and reply semantics.
