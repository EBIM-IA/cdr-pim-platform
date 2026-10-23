# ADR-016: Scan uploads and retain unreferenced files for 30 days

- Status: Accepted
- Date: 2026-10-23
- Extends: ADR-004, ADR-010 and ADR-015

## Context

CDR requested malware protection for uploaded files and cleanup of replaced or
orphaned objects. CDR chose 30 days of retention and explicitly required keeping
files belonging to deleted catalogs that can still be restored. File signatures
and MIME checks alone do not detect malware. Immediate deletion on product asset
replacement also prevents a consistent retention policy.

## Decision

The API scans every persisted upload with the real ClamAV engine before writing
it to object storage. This includes PDF catalogs, product documents, images and
individual files accepted from ZIP imports. A detection rejects the upload;
connection failures, timeouts, invalid replies and stale signature databases fail
closed. No object or business metadata is created on a rejected scan. Direct
presigned writes are unavailable through the scanning adapter because they would
bypass this check. Local and hermetic test runs may explicitly use the disabled
driver; hosted API configurations require ClamAV.

ClamAV runs as an essential sidecar in the same ECS task as the API. Its TCP
listener binds to loopback and has no external port mapping. The official image
is pinned by digest. FreshClam updates signatures regularly, the scanner checks
their age, and encrypted or scan-limit-exceeding inputs are rejected. Resource
reservations, startup dependency and health checks are part of the reviewed task
definition transformation in the promotion workflow. This extends the existing
application-owned task revision mechanism; Terraform continues to own networks,
IAM, storage and initial ECS resources. New runtime permissions still require an
infrastructure change, rather than an application-created IAM policy.

Cleanup uses a durable inventory and a 30-day grace period after an object is
observed without a reference. An old upload newly replaced today cannot be
deleted merely because its S3 modification date is old. The inventory covers
only the application's managed file namespaces. Every current catalog file is
protected, including soft-deleted, expired and inactive catalogs. Restoring a
catalog therefore does not depend on the cleanup schedule. Active product asset
references are protected too.

Deletion is bounded and retryable. It rechecks references and object identity
while holding the same object lock as writers. Writers must verify availability
under that lock before committing a new reference, so a delayed upload cannot
commit a reference after cleanup. Versioned buckets require physical removal of
eligible versions and markers; creating a delete marker alone is not reported as
a completed purge. Missing inventory or deletion permissions cause a recorded
failure and leave the object intact.

## Consequences

Uploads depend on an available scanning engine and current definitions. ClamAV
requires additional task memory and CPU, and signature updates require outbound
access to the official update service. This protection does not replace other
file validation or guarantee detection of every possible threat. Existing files
are not automatically certified by enabling protection for new uploads.

Initial reconciliation conservatively starts a new grace period for historical
orphans whose retirement time was not recorded. Cleanup preserves business
metadata and audit history. It does not implement hard deletion of restorable
catalogs or define an audit retention policy.

## Alternatives

A filename or EICAR substring check would not provide a malware engine. Scanning
after making the upload downloadable would expose unverified files. A bucket
expiry rule could remove files still in use. Modification time alone would
prematurely delete an old object immediately after replacement.

## References

- [ClamAV streaming protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
- [Official container and signature updates](https://docs.clamav.net/manual/Installing/Docker.html)
