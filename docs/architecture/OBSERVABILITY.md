# Observability

## Logging

One JSON object per line on stdout. That is exactly what the ECS `awslogs` driver ships to
CloudWatch Logs, so there is no agent and no sidecar.

Every record carries:

```json
{
  "timestamp": "2026-08-30T22:49:21.199Z",
  "level": "info",
  "service": "cdr-pim-worker",
  "environment": "prd",
  "message": "job completed",
  "correlationId": "trace-final-99",
  "requestId": "…",
  "jobId": "…",
  "jobType": "SKELETON_PING",
  "durationMs": 3
}
```

`correlationId` and `requestId` come from `AsyncLocalStorage`, not from call sites — a
developer cannot forget to pass them.

Locally, `APP_ENV=local` switches to a readable single-line format that still includes the
child logger's bindings.

### Correlation, end to end

This is verified, not aspirational. An inbound `x-correlation-id` is honoured (or minted),
echoed on the response, carried into the job envelope by `buildJobEnvelope`, and attached to
every worker log line:

```
browser → x-correlation-id: trace-final-99
api     → {"message":"Request rejected","correlationId":"trace-final-99",...}
worker  → {"message":"job completed","correlationId":"trace-final-99","jobId":"c420…"}
```

One CloudWatch Logs Insights query across both log groups reconstructs a unit of work:

```sql
fields @timestamp, service, message, jobType, durationMs
| filter correlationId = 'trace-final-99'
| sort @timestamp asc
```

### Never logged

`password`, `secret`, `token`, `api key`, `authorization`, `credential`, `private key`,
`session`, `cookie`, `pin`, `otp`, `psk` — redacted centrally at any nesting depth, and
unit-tested. See `SECURITY_BASELINE.md`.

## Health probes

Two probes with two different jobs. Conflating them is a classic way to turn a database
blip into a cluster-wide restart storm.

| Endpoint                   | Question                  | Touches dependencies? | Consumer                   |
| -------------------------- | ------------------------- | --------------------- | -------------------------- |
| `GET /api/v1/health/live`  | Is this process wedged?   | **No**                | ECS container health check |
| `GET /api/v1/health/ready` | Should traffic come here? | **Yes** — PostgreSQL  | ALB target group           |

Readiness returns **503** when a dependency is down, which drains the target instead of
failing user requests. Liveness stays 200, so ECS does not kill and restart every task
during a database outage — restarting would not fix it and would remove the capacity needed
to recover.

The check is `SELECT 1`: it proves the pool can hand out a working connection, and nothing
more. A heavier query would turn a slow table into a false "not ready".

Adding a check (SQS reachable, VPN tunnel up) means registering another
`HealthIndicatorPort` in `HealthModule` — no other change.

The worker exposes the same shape on port 3002. Its readiness reports the **polling loop**,
not the queue: a worker that cannot reach SQS should keep retrying, not be killed.

## Worker job lifecycle

Every job emits, with full context:

| Event                                | Level | Meaning                                            |
| ------------------------------------ | ----- | -------------------------------------------------- |
| `job started`                        | info  | Received; includes `attempt`                       |
| `job completed`                      | info  | Acknowledged; includes `durationMs`                |
| `job failed; scheduling retry`       | warn  | Released with backoff                              |
| `job failed permanently`             | error | `PermanentJobError` — acknowledged, will not retry |
| `DLQ candidate: attempts exhausted`  | error | Left for the queue's redrive policy                |
| `No handler registered for job type` | error | Producer deployed ahead of its consumer            |

`/health/ready` also returns live counters (`received`, `completed`, `failed`, `retried`,
`deadLetterCandidates`, `unhandled`), which is the fastest way to see what a worker is doing
without opening the logs.

## Alarms that actually matter

Ordered by how much they tell you per page:

| Alarm                               | Condition                            | Why it earns a page                                                                |
| ----------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| **DLQ depth > 0**                   | Any message in the dead-letter queue | Work has been silently lost. This is the single most important alarm in the system |
| **Queue age > 15 min**              | `ApproximateAgeOfOldestMessage`      | The worker is down, stuck, or under-scaled                                         |
| **ALB 5xx rate**                    | > 1% over 5 min                      | Users are seeing failures                                                          |
| **Readiness failing**               | Unhealthy target count > 0 for 5 min | A dependency is down                                                               |
| **RDS CPU / storage / connections** | > 80%                                | Capacity, before it becomes an outage                                              |
| **VPN tunnel down**                 | `TunnelState` = 0 for 5 min          | AX synchronisation will stall                                                      |
| **`unhandled` job count > 0**       | Metric filter on the log             | Deployment ordering mistake                                                        |

Alarms route to an SNS topic per environment. PRD notifies people; QAS notifies a channel.

## Not built yet

- **Distributed tracing.** `correlationId` gives log correlation, not spans. OpenTelemetry
  with X-Ray is the intended next step; the correlation plumbing is already in place.
- **Business metrics** (products enriched, publication rate, AI spend). These matter to
  Casa del Rulimán more than infrastructure metrics, and need their definition first.
- **Frontend error reporting.** Route-level error boundaries show a digest the user can
  quote; nothing ships that digest anywhere yet.
