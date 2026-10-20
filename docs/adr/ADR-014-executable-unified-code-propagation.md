# ADR-014 — Executable unified-code propagation

**Status:** Accepted

**Date:** 2026-10-07
**Supersedes:** ADR-011 decision 8 and the related unresolved execution details

## Context

ADR-011 established the ownership rules for replicable attributes, applications and external
homologs, but deliberately kept automatic propagation disabled until the client confirmed its
scope. The subsequent review confirmed that the unified code is the propagation boundary:

- only template attributes explicitly marked as replicable are shared;
- applications are owned by and inherited from the unified-code group;
- documents, images and other manufacturer-specific assets stay on the individual SKU; and
- external homolog search may expand to sellable products only for active, approved relations.

The operational catalogue now has template policies, role-level permissions, optimistic
versions and immutable audit storage, so the earlier implementation blocker no longer applies.

## Decision

1. A manual cell update or confirmed category import propagates a replicable attribute to the
   other products in the same unified-code group.
2. Every destination is re-authorised independently. It must have an active template containing
   the same active attribute assignment, that assignment must also be replicable, and the actor
   must have the corresponding edit/import permission.
3. Clearing a value is represented by a tombstone and propagates only to destinations where the
   attribute is optional. A required attribute cannot be cleared.
4. Optimistic concurrency protects the requested source cell. Destination rows are locked in the
   propagation transaction so two confirmed writes cannot interleave partially.
5. Updating a published product—source or replica—returns it to `in_review`.
6. Every changed product receives its own immutable audit entry, and all values, lifecycle
   changes and audit rows commit in one PostgreSQL transaction.
7. Applications are persisted once per unified-code group. Looking them up from a SKU resolves
   group membership; it does not copy application rows into every product.
8. Homolog and OEM expansion remains fail-closed: only active and approved relations participate
   in search.

## Consequences

- An edit can intentionally replace an existing destination value. The audit trail preserves the
  former value and identifies the actor and correlation id for every affected SKU.
- Attribute deactivation immediately removes it from display, import, technical-sheet export and
  propagation without deleting historical values.
- Adding a brand-new SKU to a group must invoke the same propagation capability from the future AX
  ingestion adapter. That trigger cannot be wired until CDR supplies the AX contract, but the
  persistence rule no longer needs to be redesigned.
- Files and images are never replicated because they remain SKU-owned assets.

## Rejected alternatives

- **Copy every template field:** manufacturer-specific values and files would be corrupted.
- **Store one shared attribute row per group:** products can use different templates and retain
  independent lifecycle/history, so applicability would become ambiguous.
- **Replicate in the browser:** permissions, locking and audit atomicity could be bypassed.
