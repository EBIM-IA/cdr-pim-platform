# ADR-002 — Hexagonal architecture (ports & adapters)

**Status:** Accepted · 2026-08-30

## Context

The PIM's value is the product information and the rules around it. Everything else —
Dynamics AX, PrestaShop, OpenAI, S3, SQS, PostgreSQL, NestJS itself — is replaceable
infrastructure that happens to be today's choice.

The explicit business requirement is that replacing the ERP must not mean rebuilding the
PIM. That is only achievable if the ERP is a _detail_ the business rules never see. The same
argument applies with even more force to the AI provider, which is the fastest-moving
dependency in the stack.

## Decision

Adopt ports and adapters. The dependency arrow points inwards, always:

```
EXTERNAL SYSTEM → ADAPTER → PORT → APPLICATION → DOMAIN
```

Four layers per bounded context:

| Layer             | Contains                                                    | May depend on                                       |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| `domain/`         | Entities, value objects, domain errors, **port interfaces** | Only `@cdr/shared` primitives and other domain code |
| `application/`    | Use cases orchestrating the domain through ports            | Domain + Nest DI decorators                         |
| `infrastructure/` | Adapters implementing ports (Drizzle, OpenAI, SQS, S3, AX)  | Anything                                            |
| `presentation/`   | Controllers, guards, DTO mapping                            | Application + contracts                             |

Rules:

- a port is **owned by the domain** and named for the capability, not the vendor:
  `ProductVectorIndexPort`, not `PgVectorRepository`;
- adapters translate vendor failures into domain errors, so `@aws-sdk`'s
  `SQSServiceException` never reaches a use case;
- the composition root (each `*.module.ts`) is the only place a port is bound to an adapter.

Enforcement is executable, not aspirational:

- `packages/eslint-config/hexagonal.mjs` fails the lint on a forbidden import;
- `apps/api/test/architecture/boundaries.spec.ts` statically scans every source file and
  additionally forbids cross-module reach-in, direct `process.env` reads, and any `openai`
  import outside `modules/ai/infrastructure/openai/`.

## Alternatives considered

**Layered/N-tier with a service layer over an ORM.** Rejected. Business rules end up in
services that take ORM entities as parameters, so the schema and the vendor leak into every
rule. Testing needs a database; swapping AX means touching everything.

**Clean Architecture with a full use-case/interactor ceremony** (request/response models
for every operation, mapper classes at each hop). Rejected as too much ceremony for this
team size. We keep the dependency rule and drop the boilerplate: use cases take plain
arguments and return domain objects, and the presentation layer maps them.

**Ports only at the "important" boundaries** (ERP, AI) and direct ORM access elsewhere.
Rejected. A partial rule is not enforceable, and the exceptions grow.

## Consequences

- The domain is plain TypeScript with no decorators and no imports from any framework. It
  can be unit-tested in milliseconds; `apps/api` unit tests need no database and no network.
- Every external system has a documented seam. `AxProductSourceAdapter` is currently a stub
  that throws — but the port, its in-memory sibling and the pipeline around it already exist,
  so building the real one is additive.
- Provider swaps are localised: adding `AnthropicEmbeddingAdapter` means one new file plus
  one branch in `AiModule`.

## Trade-offs

- **More files per feature.** A trivial CRUD operation touches four folders. Accepted: the
  cost is paid once per feature, the benefit is paid back on every integration change.
- **Indirection can obscure.** Reading "what actually happens" means following a port to its
  binding in the module file. Mitigated by keeping ports narrow and binding them in one place.
- **The rules must stay enforced.** If the architecture test is deleted, the architecture
  degrades quietly. Treat a change to that file as an architectural change.
