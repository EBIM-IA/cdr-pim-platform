# ADR-003 — One platform monorepo and one infrastructure repository

**Status:** Accepted · 2026-08-30

## Context

The deliverable is two independent Git repositories:

- `cdr-pim-platform` — web, API, worker and the shared libraries between them;
- `cdr-pim-infrastructure` — the Terraform that provisions AWS.

Inside the platform repository, the web app and the API share DTO shapes, the API and the
worker share the queue envelope and the configuration schema, and all three share logging
and error primitives. Those contracts change together.

## Decision

**`cdr-pim-platform` is a pnpm workspace monorepo orchestrated by Turborepo.**

```
apps/      web (Next.js) · api (NestJS) · worker (Node)
packages/  contracts · shared · config · messaging · storage · eslint-config · tsconfig
```

- **pnpm workspaces** for linking. pnpm's content-addressable store and strict,
  non-flat `node_modules` mean a package cannot import a dependency it did not declare —
  which is the same class of discipline the architecture test enforces in the source.
- **Turborepo** for task orchestration and caching. `build`, `lint`, `typecheck` and `test`
  are declared with their dependency graph (`dependsOn: ["^build"]`), so CI rebuilds only
  what changed.
- **Node 24.19.0** pinned in `.nvmrc` and `engines`; **pnpm 10.19.0** pinned via
  `packageManager` and Corepack, so every machine and CI runner resolves identically.

**Infrastructure stays in its own repository** because its lifecycle is genuinely different:
it changes rarely, is reviewed by different people, needs different credentials, and its CI
must never be able to run against production as a side effect of an application merge.

### Deviations from the structure in the original brief

Two packages were added beyond the suggested list, both documented here rather than
silently:

- **`packages/messaging`** — `QueuePort`, `SqsQueueAdapter`, `InMemoryQueueAdapter` and the
  envelope factory. The API produces jobs and the worker consumes them; without a shared
  package the envelope contract and the SQS client would be duplicated in two apps, which is
  exactly the drift the monorepo exists to prevent.
- **`packages/storage`** — `ObjectStoragePort`, `S3StorageAdapter`, `InMemoryStorageAdapter`,
  for the same reason.

The database layer was **not** extracted into a package: only `apps/api` talks to PostgreSQL
today. When the worker needs it (the first real `AI_EMBEDDING` handler), extracting
`packages/database` is the moment to do it — not before.

## Alternatives considered

**Four repositories (web, api, worker, infra).** Rejected. Every shared contract change
would become a publish-and-bump dance across repositories, and no single commit could
express "change the API response and the UI that reads it".

**One repository for everything including Terraform.** Rejected. It puts application CI and
infrastructure CI in the same blast radius and makes least-privilege credentials harder:
the workflow that builds a Docker image would sit next to one that can alter a VPC.

**Nx instead of Turborepo.** Rejected as more machinery than this repository needs. Turborepo
does task graphs and caching and stops there; Nx's generators and plugin model would be
unused weight.

**npm/yarn workspaces.** Rejected. npm's flat `node_modules` permits phantom dependencies;
pnpm's strictness is the point.

## Consequences

- One commit can change a contract, the API that serves it and the UI that consumes it, and
  CI verifies the three together.
- `pnpm verify` runs format, lint, typecheck, test and build across everything.
- Infrastructure changes are reviewed and applied on their own cadence, with their own
  credentials.

## Trade-offs

- **Turborepo cache correctness depends on declared inputs/outputs.** A task with a missing
  output declaration will appear to succeed from cache while producing nothing.
- **Two repositories means coordination for changes that span both** (a new SQS queue needs
  Terraform _and_ application configuration). The runbook for that lives in
  `docs/architecture/DEPLOYMENT_STRATEGY.md`.
- **Repository-wide CI can be slower than per-service CI** as the codebase grows. Turborepo's
  remote cache is the answer if that becomes a problem; it is not configured yet (YAGNI).
