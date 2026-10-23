# ADR-015: Token-authenticated PDF catalog sharing

- Status: Accepted
- Date: 2026-10-23
- Extends: ADR-013, without changing human capability authorization

## Context

The client requested completion and deployment of the pending PDF catalog workflow,
including usable share links. The prototype supports access by recipients without
PIM accounts. Human JWT remains the default for the application; making a whole
controller anonymous would violate the existing security boundary.

## Decision

Only two PDF read POSTs, `product-catalogs/shared/resolve` and `shared/file`, bypass
human JWT. Both require a dedicated `CatalogShareAuthGuard` validating the opaque
credential against persistent state; the use case rechecks validity before access.
Architecture tests allow these exact guarded methods and reject standalone public
catalog methods. The public web page and two matching BFF routes are exact middleware
exceptions, with existing CSP, security headers, rate limits and no-store retained.

Share credentials contain 256 random bits. PostgreSQL retains only SHA-256 digests.
The public URL carries the credential in its fragment; JavaScript sends it in JSON
without cookies. Every request verifies catalog validity, link expiry and revocation.
An active link exposes only that catalog's public metadata and current PDF, never a
storage key, internal actor, audit history or unrelated catalog. Raw credentials are
returned only at creation and held in browser memory while the panel remains open.

All human catalog reads and commands require their capabilities. Existing business
roles receive catalog read/share; Admin and Compras receive write. Metadata changes
and audit are transactional and versioned. Soft deletion revokes existing links;
restoration preserves those revocations. Private PDF storage uses the configured
ObjectStoragePort, without new bucket ACLs or public S3 permissions.

## Consequences

Recipients can open and download the current PDF using the share link. Possession
of the link grants access until expiry, revocation or loss of catalog validity, so
users must share it only with intended recipients. Addresses cannot be recovered
from history; a lost link must be replaced. Revocation prevents future server reads
and cannot retract copies already downloaded. Previous private objects remain
retained, consistent with product-assets; malware scanning and orphan reconciliation
remain separate operational work.

## Alternatives

Requiring a PIM account for every recipient would not complete the requested sharing
flow. Public S3 URLs would bypass immediate application revocation and catalog validity
checks. JWT-based share links would add claims and secret rotation without eliminating
the persistent revocation check. Browser-only persistence would not work across devices.
