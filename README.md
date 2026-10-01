# Casa del Rulimán — PIM / Catálogo Maestro de Productos

Plataforma especializada en información de productos (PIM) con capacidades de IA,
**independiente del ERP**. Monorepo con la aplicación web, la API y el worker.

> **Estado: foundation + primera interfaz operativa.** La base técnica y la navegación del
> PIM están construidas, verificadas y documentadas. Los módulos distinguen la base ya
> disponible, las reglas funcionales confirmadas y las capacidades todavía pendientes.
> Ver [KNOWN GAPS](#known-gaps).

---

## Arranque rápido

```bash
nvm use                  # Node 24.19.0 (.nvmrc)
corepack enable          # pnpm 10.19.0 (pinned en package.json)
pnpm install

cp .env.example .env     # placeholders locales — sin secretos reales

docker compose up -d     # PostgreSQL 16 + pgvector
pnpm db:migrate          # aplica drizzle/*.sql
pnpm db:seed:demo        # opcional: 7 registros locales respaldados por la fuente
pnpm dev                 # web :3000 · api :3001 · worker :3002
```

Abre <http://localhost:3000>. La portada consulta el catálogo mediante la API y presenta un
estado de error explícito si el servicio no está disponible.

El acceso requiere iniciar sesión con `AUTH_LOCAL_EMAIL` y `AUTH_LOCAL_PASSWORD` de tu
`.env`. La cuenta local es únicamente para desarrollo: la API rechaza `AUTH_MODE=local` en
QAS/PRD hasta que se conecte la fuente de identidad acordada con CDR.

La interfaz incluye catálogo y detalle de productos, además de workspaces conectados al backend para
Categorías, Plantillas, Aplicaciones, Equivalencias, Documentos, Importaciones, IA y
Calidad, Publicación, Integraciones, Reportes y Administración. Cada workspace consulta una
proyección autenticada; cuando una operación de escritura aún carece de reglas o persistencia,
el backend la declara bloqueada y explica la dependencia. El navegador consume la API
mediante route handlers de Next y `API_BASE_URL` se resuelve en runtime, por lo que la misma
imagen puede promoverse entre ambientes.

|                   |                                      |
| ----------------- | ------------------------------------ |
| Web               | <http://localhost:3000>              |
| API               | <http://localhost:3001/api/v1>       |
| OpenAPI / Swagger | <http://localhost:3001/api/v1/docs>  |
| Worker health     | <http://localhost:3002/health/ready> |

Detalle completo en [`docs/architecture/LOCAL_DEVELOPMENT.md`](docs/architecture/LOCAL_DEVELOPMENT.md).

---

## Arquitectura en una pantalla

**Modular monolith + hexagonal (ports & adapters).** La dependencia apunta siempre hacia
adentro:

```
SISTEMA EXTERNO  →  ADAPTER  →  PORT  →  APPLICATION  →  DOMAIN
```

El dominio no conoce NestJS, PostgreSQL, AWS, OpenAI ni Dynamics AX. Por eso reemplazar el
ERP en unos años es escribir un adapter, no reconstruir el PIM.

```
apps/
  web/      Next.js 15 · React 19 · Tailwind v4 · shadcn/ui
  api/      NestJS 11 · Drizzle · PostgreSQL + pgvector
  worker/   Node 24 · consumidor SQS · reintentos + DLQ

packages/
  contracts/       esquemas Zod compartidos (HTTP + jobs)
  shared/          Result, errores de dominio, logger JSON, UUID, reloj, correlación
  config/          esquemas de entorno validados por app
  messaging/       QueuePort + SqsQueueAdapter + InMemoryQueueAdapter
  storage/         ObjectStoragePort + S3StorageAdapter + InMemoryStorageAdapter
  eslint-config/   baseline + reglas de frontera hexagonal
  tsconfig/        configuraciones TypeScript compartidas
```

Los módulos delimitados de la API son `catalog`, `categories`, `attributes`,
`equivalences`, `search`, `ai`, `imports`, `integrations`, `identity`, `audit`, `health` y
el read model transversal `workspaces`.
El estado real de cada uno está en
[`docs/architecture/MODULE_ARCHITECTURE.md`](docs/architecture/MODULE_ARCHITECTURE.md).

**Las reglas se verifican, no se confían:** `apps/api/test/architecture/boundaries.spec.ts`
falla el build si el dominio importa un framework, si un módulo entra en las tripas de otro,
si alguien lee `process.env` fuera del proveedor de configuración, o si el SDK de OpenAI
aparece fuera de su carpeta de adapter.

---

## Comandos

```bash
pnpm dev                # los tres apps con recarga en caliente
pnpm test               # unitarios + arquitectura (herméticos, sin base de datos)
pnpm test:integration   # requiere docker compose up -d postgres
pnpm lint               # ESLint, incluidas las reglas de frontera
pnpm typecheck          # tsc --noEmit en todo el monorepo
pnpm build              # compila todo
pnpm verify             # format + lint + typecheck + test + build (lo que corre CI)

pnpm db:new <nombre>    # crea la siguiente migración numerada
pnpm db:migrate         # aplica las migraciones pendientes
pnpm db:seed:demo       # seed local/test idempotente; no sobrescribe datos existentes
```

Para un solo workspace: `pnpm --filter @cdr/api <script>`.

---

## Recorrido vertical (walking skeleton)

Verificado end to end contra servicios reales:

**Síncrono** — `GET /api/v1/products/:id`
navegador → route handler de Next.js → cliente API → NestJS → caso de uso →
`ProductRepositoryPort` → adapter Drizzle → PostgreSQL

**Semántico** — `GET /api/v1/search/semantic?q=...`
consulta → `EmbeddingProviderPort` → `vector(1536)` → distancia coseno con índice HNSW →
resultados ordenados

**Asíncrono** — `POST /api/v1/imports/skeleton-ping`
API → `QueuePort` → `SqsQueueAdapter` → SQS real (LocalStack) → worker → `job completed`,
con el mismo `correlationId` en todos los logs

---

## Decisiones

| ADR                                                                    | Decisión                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| [001](docs/adr/ADR-001-modular-monolith.md)                            | Modular monolith, no microservicios                     |
| [002](docs/adr/ADR-002-hexagonal-architecture.md)                      | Arquitectura hexagonal                                  |
| [003](docs/adr/ADR-003-monorepo-platform-two-repositories.md)          | Monorepo + repo de infraestructura                      |
| [004](docs/adr/ADR-004-aws-ecs-fargate.md)                             | AWS ECS Fargate                                         |
| [005](docs/adr/ADR-005-postgresql-pgvector.md)                         | PostgreSQL + pgvector                                   |
| [006](docs/adr/ADR-006-sqs-eventbridge-no-redis.md)                    | SQS + EventBridge, sin Redis                            |
| [007](docs/adr/ADR-007-openai-provider-adapter.md)                     | OpenAI detrás de puertos                                |
| [008](docs/adr/ADR-008-site-to-site-vpn.md)                            | VPN Site-to-Site hacia la red CDR                       |
| [009](docs/adr/ADR-009-database-access-library.md)                     | Drizzle + migraciones SQL escritas a mano               |
| [010](docs/adr/ADR-010-iac-terraform.md)                               | Terraform                                               |
| [011](docs/adr/ADR-011-unified-code-inheritance-and-homolog-search.md) | Herencia por código unificador y búsqueda por homólogos |

Documentación de arquitectura completa en [`docs/architecture/`](docs/architecture/).

---

## Seguridad

- **Ningún secreto en el repositorio.** `.env` está en `.gitignore`; `.env.example` solo
  tiene placeholders evidentes. CI ejecuta gitleaks sobre el historial.
- Configuración validada al arranque: el proceso no arranca mal configurado, y los errores
  nombran la variable, nunca su valor.
- El logger redacta centralmente `password`, `secret`, `token`, `api key`, `authorization`,
  `psk` y similares, a cualquier profundidad.
- **JWT + RBAC están activados y la API es privada por defecto.** Solo login y health usan
  `@Public()`. Para desarrollo existe una cuenta configurada íntegramente por entorno;
  QAS/PRD la rechazan y permanecen fail-closed hasta integrar la identidad definitiva. Los
  límites de esta etapa están en
  [`SECURITY_BASELINE.md`](docs/architecture/SECURITY_BASELINE.md).

---

## KNOWN GAPS

Deliberado, no olvidado. Cada punto está justificado en la documentación enlazada.

| Área                   | Falta                                                            | Bloqueado por                                                           |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Dynamics AX            | Adapter real (hoy es un stub que falla con un error documentado) | Superficie de integración, mapeo de entidades y VPN — pendientes de CDR |
| PrestaShop / pedidos   | Adapters reales                                                  | Acceso a API, mapeo de campos, ubicación de red                         |
| Categorías y atributos | Persistencia (solo existen los tipos de dominio)                 | La taxonomía y el diccionario de atributos son entregables de CDR       |
| Autenticación          | Fuente empresarial, refresh y revocación                         | ¿Cuentas administradas en el PIM o Active Directory/OIDC de CDR?        |
| Auditoría              | Tabla `audit_entries` duradera (hoy va al log estructurado)      | Requisitos de retención y reporte                                       |
| IA                     | Control de presupuesto y rate limiting                           | Debe existir antes de generar en volumen con una clave real             |
| AWS                    | `terraform plan` / `apply`                                       | No se entregaron credenciales; no se inventó ninguna                    |
| API                    | Rate limiting y WAF                                              | Requisito previo a exponer a internet                                   |

---

## Estructura del proyecto

Este repositorio es uno de dos:

- **`cdr-pim-platform`** (este) — web, API, worker, librerías compartidas
- **`cdr-pim-infrastructure`** — Terraform para AWS (QAS y PRD)

Para trabajar en este código, empieza por [`CLAUDE.md`](CLAUDE.md): contiene las reglas de
dependencia, los flujos habituales y lo que está prohibido.
