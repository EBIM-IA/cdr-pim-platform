# Local development

## Prerequisites

| Tool    | Version    | Notes                                                       |
| ------- | ---------- | ----------------------------------------------------------- |
| Node.js | 24.x       | `nvm use` reads `.nvmrc`                                    |
| pnpm    | 10.19.0    | `corepack enable` — the version is pinned in `package.json` |
| Docker  | any recent | Provides PostgreSQL and, optionally, LocalStack             |

## First run

```bash
nvm use                      # Node 24.19.0
corepack enable              # pnpm 10.19.0
pnpm install

cp .env.example .env         # local placeholders — no real secrets
chmod 600 .env               # keep local credentials private to your user

docker compose up -d         # PostgreSQL 16 + pgvector
pnpm db:migrate              # applies drizzle/*.sql
pnpm db:seed:demo            # inserts the 7 source-backed demo products (optional)
pnpm dev                     # web :3000 · api :3001 · worker :3002
```

Then open <http://localhost:3000>. After login, the dashboard, product catalogue and eleven
operational workspaces read through the authenticated Next.js BFF and the NestJS API.

Useful URLs:

|                 |                                      |
| --------------- | ------------------------------------ |
| Web             | <http://localhost:3000>              |
| API             | <http://localhost:3001/api/v1>       |
| OpenAPI/Swagger | <http://localhost:3001/api/v1/docs>  |
| Worker health   | <http://localhost:3002/health/ready> |

## Configuration

**One `.env` at the repository root** is the single source of truth. `dotenv-cli` injects it
into every dev process, so application code never parses a dotenv file — in QAS/PRD the
variables come from the ECS task definition and Secrets Manager.

Defaults are chosen so a fresh clone works with no accounts and no keys:
`AI_PROVIDER=fake`, `QUEUE_DRIVER=memory`, `STORAGE_DRIVER=memory`.

### Optional source-backed demo catalogue

After migrations, `pnpm db:seed:demo` adds the seven non-illustrative records traced to
`PLANTILLAS_PIM.xlsx` by the earlier platform seed. It populates only the current schema:
products, SKU/supplier identifiers, unified-code groups and memberships. The command is
idempotent and never updates a row that already exists; curated local changes are kept.
Stable UUIDs make database resets reproducible. The command refuses to run unless
`APP_ENV` is `local` or `test`. The earlier `REVIEW` and `APPROVED` values map to the
current `in_review` and `published` lifecycle states, respectively.

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

| Symptom                                                   | Cause and fix                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/health/ready` returns 503 with `database: down`         | PostgreSQL is not up: `docker compose up -d postgres`. Also check `DATABASE_SSL=false` locally       |
| `EnvironmentValidationError` on start                     | A variable is missing or malformed. The message names the variable — never its value                 |
| `Migration ... was modified after being applied`          | An applied migration was edited. Restore it and write a new one; the checksum guard is doing its job |
| `Nest can't resolve dependencies` after adding a provider | Register the provider in its module, and use `@Inject(TOKEN)` for symbol tokens                      |
| Web shows "sin conexión"                                  | The API is not running, or `API_BASE_URL` is wrong                                                   |
| Port already in use                                       | Something else holds 3000/3001/3002. `lsof -ti tcp:3000`                                             |
| `pnpm dev` cannot find `pnpm`                             | `corepack enable`, or `nvm use` first                                                                |

## Resetting

```bash
docker compose down -v     # destroys the database volume
docker compose up -d
pnpm db:migrate
```
