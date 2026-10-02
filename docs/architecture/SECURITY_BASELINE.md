# Security baseline

## Status, honestly

| Control                                           | State                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| No secrets in git                                 | ✅ Enforced by `.gitignore`, `.env.example` placeholders and a gitleaks CI step |
| Secrets from AWS Secrets Manager in QAS/PRD       | ✅ Designed; injected via the ECS task definition                               |
| Configuration validated at boot, fail-fast        | ✅ Zod schema; the process exits rather than starting misconfigured             |
| Secrets redacted from logs                        | ✅ Central redaction in the logger, unit-tested                                 |
| Structured error responses with no stack traces   | ✅ Single exception filter                                                      |
| Encryption at rest (RDS, S3) and in transit (TLS) | ⏳ Deployment requirement; IaC is outside this repository                       |
| Private subnets, least-privilege security groups  | ⏳ Deployment requirement; IaC is outside this repository                       |
| Per-task IAM roles                                | ⏳ Deployment requirement; IaC is outside this repository                       |
| JWT access tokens + RBAC                          | ✅ Global guards; private by default                                            |
| Local login for development                       | ✅ Environment-backed, constant-time comparison                                 |
| Enterprise user source, refresh, revocation       | ❌ Not built — blocked on a CDR decision                                        |
| Application rate limiting                         | ✅ Global + login account/IP + actor-based AI/index limits                      |
| Durable business audit                            | ✅ PostgreSQL append-only table; UPDATE/DELETE/TRUNCATE rejected                |
| Browser/BFF hardening                             | ✅ Nonce CSP, security headers, no-store responses, upstream timeouts           |
| Dependency vulnerability scanning                 | ✅ CI gate; current lockfile has no known vulnerabilities                       |
| GitHub workflow supply-chain controls             | ✅ Actions/images pinned; untrusted inputs validated before OIDC                |
| Protected `main` branch                           | ⚠️ Repository administration still required                                     |

## Authentication is enabled and fail-closed

`JwtAuthGuard` and `RolesGuard` are registered globally. Every API controller is protected
unless it opts out with `@Public()`; only `POST /api/v1/auth/login` and the health probes do
so. Missing or invalid bearer credentials return `401 UNAUTHORIZED`, while an authenticated
actor without a required role returns `403 FORBIDDEN`.

For local/test development, `EnvironmentCredentialVerifier` reads one account exclusively
from `AUTH_LOCAL_USER_ID`, `AUTH_LOCAL_EMAIL`, `AUTH_LOCAL_PASSWORD` and
`AUTH_LOCAL_ROLES`. Email and password comparisons are SHA-256-normalized and performed
with Node's `timingSafeEqual`; failures always return the same message. Credentials are never
stored in source code and the validated logger redacts them.

`AUTH_MODE=local` is rejected when `APP_ENV` is `qas` or `prd`. No insecure fallback exists:
those environments cannot start until the identity port has an enterprise adapter. This is
intentional fail-closed behavior.

The local login returns an actor, a short-lived access token and its TTL. It intentionally
does **not** issue a refresh token: refreshing safely requires a durable source from which to
re-read disabled state and roles, plus rotation and revocation semantics.

### The blocking question for Casa del Rulimán

Where do users come from — local accounts managed in the PIM, or the existing Active
Directory / Microsoft 365 tenant? The answer changes `TokenServicePort`'s implementation and
whether an SSO integration is needed. It was not invented.

## Access-token design

- The access-token signing secret must be at least 32 characters — enforced by the
  configuration schema, which
  reports the _variable name_ and never the value on failure.
- Access tokens carry the subject, email and current coarse roles. Their lifetime is short
  (`15m` by default and never more than one hour) because no revocation source exists in
  local mode.
- Signing and verification pin `HS256`, issuer and audience; every token has a unique `jti`.
  Tokens missing those constraints are rejected.
- Refresh tokens are not issued in this phase.
- Verification failures return a generic "Invalid or expired token". The library's reason
  ("jwt expired" vs "invalid signature") tells an attacker which half of the credential to
  fix.

## Roles

`ADMIN > EDITOR > VIEWER`, ranked so a higher role satisfies a lower requirement.
Deliberately coarse: the real permission matrix (who may publish, who may approve
AI-generated copy, who may edit equivalences) is a functional decision still pending.
Starting coarse and splitting later is cheaper than inventing permissions nobody asked for.

Every protected HTTP route declares a minimum role; authentication alone is not enough:

| Minimum role | Current operations                                                                  |
| ------------ | ----------------------------------------------------------------------------------- |
| `VIEWER`     | Read the current actor, products, semantic-search results and workspace projections |
| `EDITOR`     | Create products, index/re-index products and enqueue product embedding work         |
| `ADMIN`      | Run the worker skeleton/operations probe                                            |

The metadata is enforced centrally by `RolesGuard`, including class-level defaults with
method-level overrides. `@Public()` takes precedence so login and health remain reachable
without an actor; an architecture regression test fixes both the public-route allowlist and
the role assigned to every current controller operation. A protected route with no role
metadata is rejected rather than silently authorized.

## Secrets

**Local development**: `.env`, git-ignored. `.env.example` contains only obvious
placeholders whose blast radius is a container on `127.0.0.1`.

**QAS/PRD**: AWS Secrets Manager, referenced by ARN from the ECS task definition's `secrets`
block. Values become process environment variables at task start — never files, never image
layers, never Terraform state.

Terraform _creates_ the secret and its access policy; the value is populated out of band.
`.tfvars` files carrying secrets are git-ignored, and the VPN pre-shared key is a `sensitive`
variable.

Rotation: RDS credentials via Secrets Manager rotation; future JWT secrets by writing a new
version and restarting the service (invalidating live sessions — acceptable, and a reason to
keep access-token TTL short).

## What is never logged

The logger redacts, at any nesting depth, keys matching:
`password`, `secret`, `token`, `api[-_]key`, `authorization`, `credential`, `private[-_]key`,
`session`, `cookie`, `pin`, `otp`, `psk`.

This is central rather than left to call sites, because relying on developers to remember
does not scale. Free-form messages, error stacks and nested causes are also scrubbed for
Bearer/JWT values, credentials embedded in URLs, query-string tokens and common API-key
formats. It is unit-tested against the exact variable names this platform uses
(`OPENAI_API_KEY`, `DATABASE_PASSWORD`, `vpn_psk`, `refreshToken`, …).

Error responses carry a `code`, a safe `message`, non-sensitive `details` and a
`correlationId` — never a stack trace, never a driver message that could disclose schema,
hostnames or credentials.

## Abuse controls

Every API route has both a per-route limit and a cross-route global limit. Login adds two
independent five-attempt windows: one keyed by normalized account email and one by trusted
client IP. Semantic search and synchronous indexing have tighter actor-based budgets.
Blocked requests return `429` and a standard `Retry-After` header; the BFF preserves it.

These in-process counters protect one task. A public multi-task deployment still requires
an ALB/WAF rule for a shared edge limit. `TRUST_PROXY_HOPS` must name the exact load-balancer
hop count; QAS/PRD refuse to start when it is zero.

## Business audit

Business mutations write immutable records to `audit_entries` with actor, resource,
correlation id, source, timestamp and field-level changes. PostgreSQL triggers reject
`UPDATE`, `DELETE` and `TRUNCATE`; integration tests exercise all three paths. Product
creation is the first connected mutation. Each future mutation must write through
`AuditPort` before it is considered complete.

Retention, archival and access to audit reports remain operational decisions for CDR; they
cannot be inferred safely from the application repository.

## Network deployment requirements

The following are required for QAS/PRD but must be verified in the separate infrastructure
repository; this application repository is not evidence that they are deployed:

- RDS is in a private data subnet with **no route to the internet**, reachable only on 5432
  from the ECS task security groups.
- ECS tasks are in private subnets; inbound only from the ALB security group.
- Dynamics AX is reached only over the Site-to-Site VPN, only by the worker's security
  group, and only on the specific hosts and ports the integration needs.
- S3 buckets have public access blocked; browsers reach an asset only via a short-lived
  presigned URL.

## Known gaps

1. **Enterprise identity and revocation are pending.** QAS/PRD deliberately fail to start
   until CDR chooses and configures its identity provider.
2. **No shared edge limit/WAF is defined here.** The application limit is per running task;
   the AWS control belongs in the infrastructure repository.
3. **Audit retention and archival are not defined.** CDR must specify the required period,
   access model and external/tamper-resistant archive.
4. **Infrastructure controls are not verifiable from this repository.** RDS/S3 encryption,
   backups, IAM and network isolation must be reviewed in the IaC repository.
5. **`main` is not yet protected by a GitHub branch rule or ruleset.** Repository
   administrators must require pull requests, green CI and approval; application code cannot
   prevent a privileged direct push. PRD promotion independently fails closed unless its
   environment requires a reviewer and prevents self-review.
6. **No penetration test.** It should precede go-live in an authorized environment.
