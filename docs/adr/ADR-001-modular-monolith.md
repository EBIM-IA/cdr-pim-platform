# ADR-001 — Modular monolith, not microservices

**Status:** Accepted · 2026-08-30

## Context

Casa del Rulimán needs a PIM for roughly 45,000 SKU, built by a small team over an initial
16-week horizon. The system integrates with Dynamics AX 2012 R2, PrestaShop, an
order-taking application and manufacturer feeds, and must survive the ERP being replaced
years from now without being rebuilt.

Two forces pull in opposite directions:

- the domain genuinely has several distinct areas — catalog, categories, attributes,
  equivalences, search, AI, imports, integrations, identity, audit — which will be worked on
  by different people and may eventually scale differently (embedding generation is bursty
  and CPU/cost-bound; catalog reads are not);
- the team is small, there is no platform team, and there is no operational history to
  justify distributed-systems overhead.

## Decision

Build a **modular monolith**: one deployable API process plus one deployable worker
process, internally partitioned into bounded contexts with enforced boundaries.

Concretely:

- each bounded context lives in `apps/api/src/modules/<context>/` with its own
  `domain/`, `application/`, `infrastructure/` and `presentation/` layers;
- a context's public surface is exactly what its Nest module exports plus the types in its
  `domain/ports` and `domain/entities`. Nothing else may be imported from outside;
- **no cross-module database access.** A module reads another module's data through that
  module's published port, never by querying its tables;
- the rule is enforced by an executable test
  (`apps/api/test/architecture/boundaries.spec.ts`) and by ESLint, not by convention.

Asynchronous work runs in a separate `apps/worker` deployable from the start, because it
has genuinely different scaling and failure characteristics.

## Alternatives considered

**Microservices from day one.** Rejected. Every boundary would become a network call, a
deployment unit, a contract version and a distributed transaction, before we know where the
real boundaries are. At this team size the operational tax would consume most of the
16 weeks and buy nothing: 45k SKU is a small dataset and the request volume is modest.

**An unstructured monolith** (`controllers/`, `services/`, `repositories/`). Rejected. It
is the cheapest thing to start and the most expensive thing to change. Without enforced
module boundaries the codebase converges on shared services and cross-cutting queries, and
extracting anything later becomes a rewrite.

**Serverless (Lambda) per capability.** Rejected. Cold starts hurt an interactive editing
tool, long-running import and embedding jobs fight the execution limit, and the
VPC-plus-VPN networking needed to reach AX makes Lambda's networking story worse rather
than better.

## Consequences

- One image to build, one database to migrate, one place to debug. Local development is
  `docker compose up -d && pnpm dev`.
- Refactoring across contexts is a compile-time operation, not a contract negotiation.
- Extraction stays available: because a context only touches others through ports, turning
  one into a separate service means replacing an in-process adapter with an HTTP or queue
  adapter — the domain and application layers do not change.
- ERP independence comes from ADR-002's ports, not from process boundaries. Replacing AX is
  a new adapter, whatever the deployment topology.

## Trade-offs

- **A shared failure domain.** A memory leak in the imports context can take the API down.
  Mitigated by the worker being separate (where the heavy, risky work runs) and by ECS
  running multiple API tasks.
- **Coarse scaling.** The whole API scales together. At this volume that is cheaper than
  the alternative; if one context ever needs its own scaling curve, that is the signal to
  extract it.
- **Boundary discipline depends on enforcement.** The architecture test is load-bearing.
  Deleting or weakening it silently converts this decision into an unstructured monolith.
