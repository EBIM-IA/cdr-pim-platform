# ADR-005 — PostgreSQL with pgvector as the single datastore

**Status:** Accepted · 2026-08-30

## Context

The PIM stores structured product data (SKUs, identifiers, categories, typed attributes),
relationships that are genuinely relational (equivalence groups spanning many products), and
embeddings for semantic search over roughly 45,000 products.

Search needs to combine both worlds: "rodamientos sellados de 25 mm de diámetro interior"
should filter on attributes _and_ rank by semantic similarity. Splitting those into two
stores means either two round trips with a merge step, or a synchronisation problem.

## Decision

**One PostgreSQL 15+ database with the `pgvector` extension.** Amazon RDS PostgreSQL in
QAS and PRD; the `pgvector/pgvector:pg16` image locally.

- Embeddings live in `product_embeddings` as a `vector(1536)` column, one row per
  (product, model) pair.
- Similarity uses cosine distance (`<=>`) with an **HNSW** index
  (`m = 16`, `ef_construction = 64`).
- Relational integrity is enforced by the database, not only by the application: foreign
  keys with `ON DELETE CASCADE`, `CHECK` constraints for enumerated values, and partial
  unique indexes for rules such as "at most one primary product per equivalence group".

### On the initial schema

Migration `0001` creates only `products`, `product_identifiers`, `equivalence_groups` and
`equivalence_group_members`; `0002` adds `product_embeddings`. Tables for categories,
attributes, documents, images and data quality are **deliberately not created**: their shape
depends on functional decisions Casa del Rulimán has not made yet, and speculative tables
would have to be migrated away later. The corresponding domain types exist so the shape can
be discussed in code.

### Two modelling decisions worth stating

- **Identifiers are rows, not columns.** A product carries a SKU, an AX item id, a
  manufacturer part number, EAN/UPC and legacy codes. As columns this becomes a widening
  table and an unindexable lookup; as rows it is one table with a unique index on
  `(type, value)`.
- **An equivalence group is its own aggregate.** A "código unificador" as a string on
  `products` cannot express one group holding N products _and_ one product belonging to N
  groups. The join table makes both natural and is covered by integration tests.

## Alternatives considered

**PostgreSQL + a dedicated vector database** (Pinecone, Qdrant, OpenSearch). Rejected. It
adds a second store to operate, secure and keep in sync, and turns every hybrid query into
application-side joining. At 45k vectors pgvector is far inside its comfort zone.

**PostgreSQL + Elasticsearch for lexical search.** Rejected for now, and explicitly excluded
by the brief. PostgreSQL's own full-text search plus trigram indexes covers lexical needs at
this volume; revisit only with evidence.

**A document store (MongoDB/DynamoDB) for flexible attributes.** Rejected. The attribute
model is the part that most needs validation and referential integrity — a definition, a
unit, allowed values, and a category template saying what is mandatory. Losing constraints
here to gain schema flexibility trades away the PIM's main quality lever. Where genuine
flexibility is needed, PostgreSQL's `jsonb` is available inside the same transaction.

## Consequences

- One backup, one restore procedure, one set of credentials, one connection pool.
- Attribute filters and vector ranking compose in a single SQL statement.
- Point-in-time recovery, Multi-AZ and read replicas come from RDS with no extra design.
- `AI_EMBEDDING_DIMENSIONS` must equal the `vector(N)` column width. This is asserted by an
  integration test rather than left to documentation.

## Trade-offs

- **A fixed vector width.** Changing dimensionality is a new migration plus a full
  re-embedding, not an `ALTER`. Mitigated by storing the model on every row so old and new
  vectors can coexist during a migration.
- **HNSW index build cost and memory.** Negligible at 45k rows; would need
  `maintenance_work_mem` tuning and `CONCURRENTLY` at a much larger scale.
- **pgvector will not match a purpose-built vector engine at very large scale.** The escape
  hatch is `ProductVectorIndexPort` (ADR-002): moving the index elsewhere is an adapter, and
  the use cases do not change.
