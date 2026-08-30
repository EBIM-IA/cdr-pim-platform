# ADR-009 — Drizzle ORM for queries, hand-written SQL for migrations

**Status:** Accepted · 2026-08-30

## Context

We need typed database access and a migration system. Requirements, in priority order:
PostgreSQL-first, trustworthy migrations, first-class `pgvector` support, room for complex
queries, low coupling to the domain, and maintainability by a small team.

Hexagonal architecture (ADR-002) constrains the choice: whatever we pick must stay entirely
inside `infrastructure/`. A library that wants to own the entity model would fight that.

## Decision

**Drizzle ORM** as the query builder and typed schema, with **`postgres.js`** as the driver.
**Migrations are hand-written SQL** applied by a small custom runner
(`apps/api/src/database/migrator.ts`).

### Why Drizzle over the alternatives

- **Prisma** — excellent DX and mature migrations, but it owns the model: `schema.prisma` is
  a second source of truth, generated client types propagate outward, and `pgvector` needs
  preview features plus raw queries for the vector operators. Its query engine is also a
  separate binary in the image.
- **TypeORM** — decorator-based entities actively encourage putting persistence concerns on
  domain classes, which is precisely what ADR-002 forbids. Its migration generation is not
  reliable enough to trust for QAS/PRD parity.
- **Drizzle** — table definitions are plain values in `infrastructure/persistence/`, queries
  are SQL-shaped, and `pgvector` is first class: `vector()` columns, `cosineDistance()`, and
  HNSW-aware ordering. Nothing about it leaks into the domain.
- **Raw `postgres.js` only** — considered seriously. Rejected because we would hand-write
  result mapping for every query and lose column-level type safety at exactly the place
  errors are most expensive.

### Why hand-written migrations rather than `drizzle-kit generate`

The generator produces plain SQL plus snapshot metadata. We keep the SQL and drop the
metadata, because:

- the DDL that actually matters here is beyond what any generator emits well —
  `CREATE EXTENSION vector`, HNSW indexes with explicit `m`/`ef_construction`, partial unique
  indexes, `CHECK` constraints, trigger functions. We would hand-write all of it anyway;
- snapshot files are a merge-conflict magnet on a team, and resolving one wrongly produces a
  migration that is silently incorrect;
- a migration is a permanent operational artefact. Reading exactly the SQL that will run
  against production, in review, is worth more than the minutes generation saves.

The runner adds two guarantees that no generator provides:

1. **Immutability, enforced by checksum.** Every applied migration's SHA-256 is stored and
   re-verified. Editing a file that has already run anywhere is a hard error — the failure
   mode it prevents is QAS and PRD silently diverging.
2. **Advisory locking.** Concurrently starting tasks cannot race the same DDL.

The one seam this creates — the Drizzle table definitions could drift from the SQL — is
closed by `test/integration/schema-drift.spec.ts`, which compares every declared column
against `information_schema` on a freshly migrated database.

## Consequences

- Migrations are reviewable SQL with comments explaining _why_, and a documented reverse
  statement where one is sensible.
- `pnpm db:new <name>` scaffolds the next file with correct numbering; `pnpm db:migrate`
  applies pending ones and is safe to run repeatedly.
- In AWS, migrations run as a one-off ECS task from the same image as the service.
- Repository adapters return domain aggregates; row types never leave the adapter file.

## Trade-offs

- **Writing SQL by hand is slower** and puts the correctness of each statement on the author.
  Mitigated by the drift test and by integration tests that exercise every constraint.
- **Down migrations are not automated.** Reversal statements are documented in each file
  where they are sensible; genuinely destructive changes say so explicitly. Rolling _forward_
  is the default recovery path.
- **A custom runner is code we own** (~150 lines). Small, tested, and the properties it
  enforces are ones we specifically need.
- **Drizzle is younger than Prisma/TypeORM.** Accepted: it is confined to `infrastructure/`,
  so replacing it means rewriting adapters, not the domain — and the migration history,
  being plain SQL, would survive untouched.
