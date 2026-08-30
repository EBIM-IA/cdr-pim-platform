# ADR-007 — OpenAI as the initial AI provider, behind provider ports

**Status:** Accepted · 2026-08-30

## Context

The PIM uses AI for embeddings (semantic search), text generation (B2C descriptions from
technical data) and document extraction (attributes from supplier PDFs). OpenAI is the
chosen starting provider.

AI providers are the least stable dependency in this stack: models are renamed and
deprecated on a timescale of months, pricing changes, and a better or cheaper option appears
regularly. The brief requires that adding `AnthropicAdapter` later must not touch the
domain.

## Decision

**Three narrow ports, owned by the domain, one adapter set per provider.**

| Port                             | Purpose                               |
| -------------------------------- | ------------------------------------- |
| `EmbeddingProviderPort`          | text → vector, batched                |
| `TextGenerationProviderPort`     | instruction + input → text            |
| `DocumentExtractionProviderPort` | document bytes → candidate attributes |

They are separate rather than one `AiPort` because their consumers, failure modes and
scaling profiles differ, and because a future provider might be best-in-class for one and
not the others.

- `import OpenAI` appears **only** in `apps/api/src/modules/ai/infrastructure/openai/`.
  The architecture test fails the build if it appears anywhere else.
- **No model name is ever hardcoded.** `AI_PROVIDER`, `AI_GENERATION_MODEL`,
  `AI_EMBEDDING_MODEL` and `AI_EMBEDDING_DIMENSIONS` are configuration.
- Adapters translate vendor exceptions into `DependencyUnavailableError`, so an
  `APIConnectionError` never reaches a use case.
- Every port has a **deterministic fake**. `FakeEmbeddingAdapter` is not a stub returning
  zeroes: it hashes token trigrams into a normalised bag-of-features, so semantically
  overlapping strings really are closer under cosine similarity. That is enough to exercise
  the entire pgvector pipeline in tests without a network call.
- `AI_PROVIDER` defaults to `fake`, so a new developer and CI both get a working system with
  no key and no cost. The configuration schema requires `OPENAI_API_KEY` only when
  `AI_PROVIDER=openai`.

## Alternatives considered

**Call the OpenAI SDK directly from use cases.** Rejected. It puts a vendor's types in the
application layer, makes every test require a key and a network, and turns a provider change
into a repository-wide edit.

**A generic LLM abstraction library** (LangChain, Vercel AI SDK). Rejected. We would be
depending on someone else's abstraction of a fast-moving space, inheriting their breaking
changes, to avoid writing three interfaces totalling well under 100 lines. Our ports express
exactly what this domain needs and nothing more.

**Self-hosted embeddings** (e.g. a sentence-transformer on ECS). Rejected for now: it trades
a per-token cost for a GPU/CPU capacity problem the team is not staffed to run. The port
makes it a future option rather than a future rewrite.

## Consequences

- Adding Anthropic is one new file plus one branch in `AiModule`. No use case, controller or
  domain type changes.
- The full test suite runs offline, deterministically and free.
- Model identity is stored **with every embedding row**, so a model migration can back-fill
  the new vectors alongside the old ones and switch over only when coverage is complete.
- Cost control is a first-class concern: `IndexProductUseCase` hashes the exact text it
  embeds and skips products whose text has not changed — the difference between paying for
  45k embeddings on every re-index and paying only for what actually changed.

## Trade-offs

- **The ports are lowest-common-denominator.** Provider-specific features (structured
  outputs, prompt caching, batch APIs) are not expressible without widening a port. That is
  the intended trade: widen deliberately when a feature earns it.
- **The fake embedding is not semantically meaningful.** It proves the plumbing, not the
  search quality. Evaluating real relevance requires the real provider and is out of scope
  for the foundation.
- **No token accounting or rate limiting yet.** `GenerationResult` carries token counts, but
  nothing aggregates them. Before any bulk generation runs against a real key, a budget guard
  is needed — recorded in `KNOWN GAPS`.
