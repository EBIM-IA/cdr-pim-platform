# Local development

## Prerequisites

| Tool    | Version    | Notes                                                         |
| ------- | ---------- | ------------------------------------------------------------- |
| Node.js | 24.x       | `nvm use` reads `.nvmrc`; other managers read `.node-version` |
| pnpm    | 10.19.0    | `corepack enable` — the version is pinned in `package.json`   |
| Docker  | any recent | Provides PostgreSQL and, optionally, LocalStack               |

## First run

```bash
nvm use                      # Node 24.19.0
corepack enable              # pnpm 10.19.0
pnpm install

cp .env.example .env         # local placeholders — no real secrets
chmod 600 .env               # keep local credentials private to your user

docker compose up -d         # PostgreSQL 16 + pgvector
pnpm db:migrate              # applies drizzle/*.sql
pnpm db:seed:demo            # inserts the 77 source-backed workbook products (optional)
pnpm dev                     # web :3100 · api :3001 · worker :3002
```

The root `.npmrc` enables `engine-strict`, and the root `preinstall` independently validates
`engines.node`. An install started from an old system Node therefore fails before dependencies or
generated artefacts can be changed. `pnpm check:runtime` performs the same check explicitly.

Then open <http://localhost:3100>. After login, the dashboard, product catalogue and eleven
operational workspaces read through the authenticated Next.js BFF and the NestJS API.

Useful URLs:

|                 |                                      |
| --------------- | ------------------------------------ |
| Web             | <http://localhost:3100>              |
| API             | <http://localhost:3001/api/v1>       |
| OpenAPI/Swagger | <http://localhost:3001/api/v1/docs>  |
| Worker health   | <http://localhost:3002/health/ready> |

## Configuration

**One `.env` at the repository root** is the single source of truth. `dotenv-cli` injects it
into every dev process, so application code never parses a dotenv file — in QAS/PRD the
variables come from the ECS task definition and Secrets Manager. The API listens on `PORT`;
the worker health server uses `WORKER_PORT`, avoiding a collision when both share the file.

Defaults are chosen so a fresh clone works with no accounts and no keys: all three AI capability
providers are `fake`, `QUEUE_DRIVER=memory`, and `STORAGE_DRIVER=memory`.

### Optional source-backed demo catalogue

After migrations, `pnpm db:seed:demo` loads the 77 real rows in the latest client workbook. It
persists 36 categories (32 active definitions and four inactive/pending categories), 32 active
templates, their role matrix, typed attribute values, unified-code groups, and the OEM, homolog
and application relations supplied by the workbook. Because the workbook does not carry an
approved lifecycle state, all products enter as `in_review`. Asset requirements (`FT`, `MSDS`,
`CERT`, `FOTO`, `PLANO`) are persisted per template and participate in completeness/publication
readiness; the seed deliberately does not invent uploaded binary files for empty spreadsheet cells.

The command is idempotent for repeated runs of the same manifest. Rows owned by this fixture are
recognized by their deterministic UUID and values present in a regenerated manifest update the
corresponding deterministic metadata, assignments and source-backed attributes. Rows created
manually with the same natural key but a different UUID, manual identifiers/relations and
attribute values whose source is `manual` are left intact. Absence is deliberately **not** a
general deletion signal: removing a product, attribute value or relation from a later workbook
requires an explicit reconciliation or migration so the seed cannot erase curated data by
accident. Stable UUIDs make database resets reproducible. The command refuses to run unless
`APP_ENV` is `local` or `test`.

The fixture indexes products with `fake-embedding-v1` even when a developer intends to enable
OpenAI later; seeding never incurs an external AI call. Vector lookup is scoped by model, so after
changing `AI_EMBEDDING_PROVIDER` to `openai` the fake vectors cannot serve semantic results from the real
model. Re-index every product through `POST /api/v1/search/index/:productId` before validating
OpenAI search, or use the bulk worker once the full-catalog re-index operation is implemented.

The repository stores the deterministic JSON manifest and its source SHA-256, not the `.xlsx`
workbook. **The manifest is not schema-only:** it materializes the 77 source rows, their typed
attribute values and the workbook's role visibility matrix. Treat it as client-confidential source
data; do not publish, attach to public build artifacts or move it to a public repository without
the client's explicit authorization. To regenerate it after receiving a new file, install Python 3
with `openpyxl` and run from the repository root:

```bash
python3 scripts/generate-client-template-manifest.py \
  '../PLANTILLAS PIM(1) (1).xlsx'
```

The generator and manifest guard validate counts, typed values, unique SKU and provider codes,
product field limits, per-category source priorities (unique integers from 1 to 4), relation field
contracts and natural-key uniqueness, and reject OEM, homolog or application rows whose
`codigo_unificador` does not exist in a product sheet. Review the JSON diff before seeding it.

## Exercising the asynchronous path for real

`QUEUE_DRIVER=memory` is in-process, so the API and the worker do not share a queue. To run
the **real** `SqsQueueAdapter` — the same code that runs in AWS — start LocalStack:

```bash
docker compose --profile aws up -d       # adds SQS + S3

# in .env:
QUEUE_DRIVER=sqs
AWS_ENDPOINT_URL=http://localhost:4566
SQS_JOBS_QUEUE_URL=http://localhost:4566/000000000000/cdr-pim-local-jobs
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

pnpm dev
# Define TOKEN with the login command in «The walking skeleton by hand» below.
curl -X POST http://localhost:3001/api/v1/imports/skeleton-ping \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" \
  -H 'x-correlation-id: my-trace' \
  -d '{"message":"hola"}'
```

The worker log shows `job started` → `SKELETON_PING processed` → `job completed`, all
carrying `correlationId: my-trace`.

LocalStack is a **Compose profile, off by default**, so the usual `docker compose up -d`
stays fast.

## Everyday commands

```bash
pnpm dev                # all three apps with hot reload
pnpm test               # unit + architecture tests — hermetic, no database
pnpm test:integration   # requires docker compose up -d postgres
pnpm lint               # ESLint, including the hexagonal boundary rules
pnpm typecheck          # tsc --noEmit everywhere
pnpm build              # build everything
pnpm verify             # format + lint + typecheck + test + build (what CI runs)

pnpm db:new <name>      # scaffold the next migration
pnpm db:migrate         # apply pending migrations
pnpm db:seed:demo       # optional local/test demo catalogue; safe to rerun
```

Filter to one workspace with `pnpm --filter @cdr/api <script>`.

### Isolated Next.js outputs

The web application deliberately uses separate Next.js output directories:

| Command                     | Output         |
| --------------------------- | -------------- |
| `next dev`                  | `.next-dev/`   |
| `next build` / `next start` | `.next-build/` |

This makes `pnpm --filter @cdr/web build` safe while a development server is running: a production
build cannot replace the development server's manifests or route cache. `pnpm --filter @cdr/web
clean` removes both directories plus the legacy `.next` directory.

## The walking skeleton by hand

```bash
# 0 · obtain a local access token (credentials come from the untracked .env)
set -a; source .env; set +a
TOKEN=$(curl -sS -X POST http://localhost:3001/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$AUTH_LOCAL_EMAIL\",\"password\":\"$AUTH_LOCAL_PASSWORD\"}" \
  | jq -r '.accessToken')

# 1 · create a product   (HTTP → use case → port → Drizzle → PostgreSQL)
curl -X POST http://localhost:3001/api/v1/products \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" \
  -d '{"sku":"6205-2rs","name":"Rodamiento rígido de bolas 6205-2RS",
       "description":"Sellado por ambos lados.","brand":"SKF"}'

# 2 · index it           (→ EmbeddingProviderPort → pgvector)
curl -X POST http://localhost:3001/api/v1/search/index/<id> \
  -H "authorization: Bearer $TOKEN"

# 3 · semantic search    (cosine similarity over vector(1536))
curl "http://localhost:3001/api/v1/search/semantic?q=rodamiento%20sellado&limit=5" \
  -H "authorization: Bearer $TOKEN"
```

## Troubleshooting

| Symptom                                                                               | Cause and fix                                                                                                                            |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/health/ready` returns 503 with `database: down`                                     | PostgreSQL is not up: `docker compose up -d postgres`. Also check `DATABASE_SSL=false` locally                                           |
| `EnvironmentValidationError` on start                                                 | A variable is missing or malformed. The message names the variable — never its value                                                     |
| `Migration ... was modified after being applied`                                      | An applied migration was edited. Restore it and write a new one; the checksum guard is doing its job                                     |
| `Nest can't resolve dependencies` after adding a provider                             | Register the provider in its module, and use `@Inject(TOKEN)` for symbol tokens                                                          |
| Web shows "sin conexión"                                                              | The API is not running, or `API_BASE_URL` is wrong                                                                                       |
| Port already in use                                                                   | Something else holds 3100/3001/3002. Revise `PORT`, `WORKER_PORT` and `lsof -iTCP:<puerto> -sTCP:LISTEN`                                 |
| `pnpm dev` cannot find `pnpm`                                                         | `corepack enable`, or `nvm use` first                                                                                                    |
| Install fails with `Unsupported environment` or `[cdr-pim] Node ... no es compatible` | The shell resolved an old system Node. Run `nvm use`, or activate the version in `.node-version`                                         |
| Development UI breaks after a build                                                   | Current versions isolate `.next-dev` and `.next-build`; stop old processes once and run the web clean command to remove a legacy `.next` |

## Resetting

```bash
docker compose down -v     # destroys the database volume
docker compose up -d
pnpm db:migrate
```
