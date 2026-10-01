# Security baseline

## Status, honestly

| Control                                           | State                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| No secrets in git                                 | ✅ Enforced by `.gitignore`, `.env.example` placeholders and a gitleaks CI step |
| Secrets from AWS Secrets Manager in QAS/PRD       | ✅ Designed; injected via the ECS task definition                               |
| Configuration validated at boot, fail-fast        | ✅ Zod schema; the process exits rather than starting misconfigured             |
| Secrets redacted from logs                        | ✅ Central redaction in the logger, unit-tested                                 |
| Structured error responses with no stack traces   | ✅ Single exception filter                                                      |
| Encryption at rest (RDS, S3) and in transit (TLS) | ✅ In the Terraform                                                             |
| Private subnets, least-privilege security groups  | ✅ In the Terraform                                                             |
| Per-task IAM roles                                | ✅ In the Terraform                                                             |
| JWT access tokens + RBAC                          | ✅ Global guards; private by default                                            |
| Local login for development                       | ✅ Environment-backed, constant-time comparison                                 |
| Enterprise user source, refresh, revocation       | ❌ Not built — blocked on a CDR decision                                        |
| Rate limiting                                     | ❌ Not built                                                                    |
| Dependency vulnerability scanning                 | ✅ `pnpm audit` in CI                                                           |

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
  (`15m` by default) because no revocation source exists in local mode.
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
the role assigned to every current controller operation.

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
does not scale. It is unit-tested against the exact variable names this platform uses
(`OPENAI_API_KEY`, `DATABASE_PASSWORD`, `vpn_psk`, `refreshToken`, …).

Error responses carry a `code`, a safe `message`, non-sensitive `details` and a
`correlationId` — never a stack trace, never a driver message that could disclose schema,
hostnames or credentials.

## Network

- RDS is in a private data subnet with **no route to the internet**, reachable only on 5432
  from the ECS task security groups.
- ECS tasks are in private subnets; inbound only from the ALB security group.
- Dynamics AX is reached only over the Site-to-Site VPN, only by the worker's security
  group, and only on the specific hosts and ports the integration needs.
- S3 buckets have public access blocked; browsers reach an asset only via a short-lived
  presigned URL.

## Known gaps

1. **No rate limiting.** A brute-force or scraping attempt against the API is unthrottled.
   `@nestjs/throttler` plus an ALB/WAF rule is the intended answer.
2. **No WAF.** Worth adding before public exposure.
3. **The audit trail is logs, not a table.** Queryable in CloudWatch Logs Insights, but not
   a durable record with a retention policy — deliberately deferred until CDR states the
   retention and reporting requirement.
4. **No penetration test.** Should precede go-live.
