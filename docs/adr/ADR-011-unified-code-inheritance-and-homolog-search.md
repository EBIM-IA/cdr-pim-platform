# ADR-011 — Código unificador, herencia y búsqueda por homólogos

**Status:** Accepted; decision 8 superseded by ADR-014
**Date:** 2026-10-01

## Context

The PIM must distinguish Casa del Rulimán SKU from the external codes used to find
equivalent products. The stakeholder review on 2026-09-30 clarified how the unified code is
expected to behave, and the follow-up validation on 2026-10-01 confirmed the effective
scope of applications and the eligibility rule for homolog search. The review also
separated two concepts that the UI must not conflate:

- a sellable SKU in Casa del Rulimán's product master; and
- an external homolog reference that is useful for finding a sellable SKU but is not itself
  a product in that master.

The existing `equivalence_groups` model already treats the unified code as its own
aggregate. The missing rules concern how later attributes, applications, and homologs use
that aggregate.

## Decision

1. Replicability is configured on the template-to-attribute assignment, not globally on the
   attribute definition. Each assignment has an explicit replicable `yes/no` rule.
2. A SKU joining a unified-code group inherits only values whose template assignments are
   replicable. Non-replicable values remain SKU-specific and keep the destination product
   incomplete until its mandatory values are supplied.
3. Replication never crosses a unified-code group. It does not merge product records: every
   SKU retains its own lifecycle, completeness, approval, brand-specific values, images, and
   supplier documents.
4. Applications have unified-code scope. The UI may find or edit them starting from a SKU,
   but the effective application set is shared or inherited by every SKU in the group.
   Application administration must support both manual entry and bulk import.
5. A homolog is an external reference associated with a unified-code group. At minimum its
   import identity contains the unified code, external homolog code, and external brand. It
   does not create a sellable product in the product master.
6. Homologs are administered centrally from Equivalences, with manual and bulk paths. A
   product-detail shortcut may exist, but it is not the source of ownership.
7. Searching an eligible external homolog expands through its unified-code group to the
   sellable member SKU. A homolog relation is eligible only while it is both active and
   approved; pending, rejected, or inactive relations are excluded from indexing and results.
8. Automatic attribute propagation remains disabled until source selection, template
   compatibility, conflict resolution, permissions, and audit behavior are approved. This
   implementation hold was lifted by ADR-014 after the client confirmed the execution rule.

## Consequences

- The template relation needs a persisted replicability flag; placing it on the global
  attribute definition would be incorrect because another template may use a different rule.
- Application reads resolve the effective set at group level while retaining the originating
  SKU, actor, and import job for audit.
- Homolog storage is separate from products and must enforce uniqueness rules without
  manufacturing catalogue records for products CDR does not sell.
- Homolog indexing and reindexing enforce active-and-approved eligibility before a match
  expands to commercial SKU.
- When these capabilities are implemented, domain tests must cover group isolation,
  selective inheritance, destination completeness, exclusion of ineligible homologs,
  bulk/manual parity, and provenance.

## Still unresolved

- Whether one source SKU governs the whole group or a source may be selected per attribute.
- The exact compatibility rule when products in one group use different template versions or
  categories.
- The initial list of non-replicable attributes, including the treatment of `pesoContNeto`.
- Replication behavior for a SKU without a unified code and conflict handling when a
  destination already has a value.
- Final OEM terminology and the complete state, permission, approval, and audit matrix.
