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
| JWT + refresh tokens, RBAC                        | ⚠️ **Implemented but not switched on** — see below                              |
| User store, login endpoint, token revocation      | ❌ Not built — blocked on a CDR decision                                        |
| Rate limiting                                     | ❌ Not built                                                                    |
| Dependency vulnerability scanning                 | ✅ `pnpm audit` in CI                                                           |

## Authentication is written but not enabled

`JwtAuthGuard`, `RolesGuard`, `@Public()`, `@RequireRole()`, the `Role` model and
`JwtTokenService` all exist and are unit-tested. They are **not** registered as `APP_GUARD`
in `AppModule`.

The reason is deliberate: there is no user store and no login endpoint, so enabling them
globally would return 403 for every route with no way to obtain a token. Shipping a
foundation that cannot be run is worse than shipping one with authentication clearly marked
as off.

To switch it on, once `identity` has a user repository and a login endpoint:

```ts
// apps/api/src/app.module.ts
providers: [
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
];
```

and mark the health probes and the login/refresh endpoints `@Public()`.

**Until then, the API must not be exposed to the internet with real data.** In QAS that is
acceptable behind an ALB restricted by security group; in PRD it is a hard prerequisite.

### The blocking question for Casa del Rulimán

Where do users come from — local accounts managed in the PIM, or the existing Active
Directory / Microsoft 365 tenant? The answer changes `TokenServicePort`'s implementation and
whether an SSO integration is needed. It was not invented.

## Token design

- **Access and refresh tokens are signed with different secrets.** A leaked access token
  cannot be replayed as a refresh token, and rotating one does not invalidate the other.
- Both secrets must be at least 32 characters — enforced by the configuration schema, which
  reports the _variable name_ and never the value on failure.
- The refresh token carries the subject only, **no roles**. Roles are re-read on refresh, so
  revoking a role takes effect within one access-token lifetime.
- Verification failures return a generic "Invalid or expired token". The library's reason
  ("jwt expired" vs "invalid signature") tells an attacker which half of the credential to
  fix.

## Roles

`ADMIN > EDITOR > VIEWER`, ranked so a higher role satisfies a lower requirement.
Deliberately coarse: the real permission matrix (who may publish, who may approve
AI-generated copy, who may edit equivalences) is a functional decision still pending.
Starting coarse and splitting later is cheaper than inventing permissions nobody asked for.

## Secrets

**Local development**: `.env`, git-ignored. `.env.example` contains only obvious
placeholders whose blast radius is a container on `127.0.0.1`.

**QAS/PRD**: AWS Secrets Manager, referenced by ARN from the ECS task definition's `secrets`
block. Values become process environment variables at task start — never files, never image
layers, never Terraform state.

Terraform _creates_ the secret and its access policy; the value is populated out of band.
`.tfvars` files carrying secrets are git-ignored, and the VPN pre-shared key is a `sensitive`
variable.

Rotation: RDS credentials via Secrets Manager rotation; JWT secrets by writing a new version
and restarting the service (invalidating live sessions — acceptable, and a reason to keep
access-token TTL short).

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
