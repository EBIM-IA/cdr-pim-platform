# C4 Level 2 — Containers

```mermaid
graph TB
    browser["Browser<br/><i>catalog editor</i>"]

    subgraph aws[AWS · one VPC per environment]
        alb["Application Load Balancer<br/><i>public subnets · TLS from ACM</i>"]

        subgraph private[Private application subnets]
            web["<b>web</b><br/>Next.js 15 · React 19<br/>ECS Fargate service"]
            api["<b>api</b><br/>NestJS 11<br/>ECS Fargate service"]
            worker["<b>worker</b><br/>Node 24 · SQS consumer<br/>ECS Fargate service"]
        end

        subgraph data[Private data subnets]
            rds[("<b>PostgreSQL 16 + pgvector</b><br/>Amazon RDS")]
        end

        sqs["Amazon SQS<br/>jobs queue + DLQ"]
        s3["Amazon S3<br/>images · documents · imports"]
        eb["EventBridge Scheduler<br/><i>delta sync, maintenance</i>"]
        secrets["Secrets Manager"]
        logs["CloudWatch Logs + Alarms"]
    end

    openai["OpenAI API"]
    vpn(["Site-to-Site VPN"])
    ax["Dynamics AX 2012 R2<br/><i>CDR internal network</i>"]

    browser -->|HTTPS| alb
    alb --> web
    alb --> api
    web -->|"REST /api/v1<br/>server-side fetch"| api

    api --> rds
    api -->|publish jobs| sqs
    api --> s3
    api --> openai

    sqs --> worker
    eb -->|scheduled jobs| sqs
    worker --> s3
    worker --> openai
    worker -.->|"AX_SYNC"| vpn --> ax

    secrets -.->|injected at task start| api
    secrets -.-> worker
    api --> logs
    worker --> logs
    web --> logs

    classDef svc fill:#8b1a1a,stroke:#5a1010,color:#fff
    class web,api,worker svc
```

## Containers

| Container                 | Technology                                   | Responsibility                                                                      | Scales on                         |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------- |
| **web**                   | Next.js 15, React 19, Tailwind v4, shadcn/ui | Server-rendered UI. Talks only to the API — never to the database                   | Request volume                    |
| **api**                   | NestJS 11, TypeScript                        | HTTP surface, business rules, all database access, job publication                  | Request volume                    |
| **worker**                | Node 24, TypeScript                          | SQS consumer: AX sync, embeddings, document extraction, imports, channel publishing | Queue depth                       |
| **PostgreSQL**            | RDS PostgreSQL 16 + pgvector                 | Every persistent record, including embeddings                                       | Vertical; read replicas if needed |
| **SQS**                   | Standard queue + DLQ                         | Work distribution and retry                                                         | Managed                           |
| **S3**                    | Private, versioned, encrypted                | Binary assets; the database stores only metadata                                    | Managed                           |
| **EventBridge Scheduler** | —                                            | Cron triggers that enqueue jobs                                                     | Managed                           |

## Communication rules

1. **The browser never calls the API directly for data it can get server-side.** Rendering
   happens in server components using the internal base URL, so the API does not have to be
   publicly reachable for the page to render.
2. **The web container has no database credentials.** It cannot query PostgreSQL even by
   mistake.
3. **The worker has no HTTP surface** beyond `/health/live` and `/health/ready`. It is not
   behind the load balancer and has no target group.
4. **The API never performs long work inline.** Anything slow or bursty becomes a job.
5. **Only the worker gets VPN egress.** The API's security group cannot reach the CDR network.

## Why three containers rather than one

The web and API split lets the UI be rendered and cached independently of business logic,
and keeps database credentials out of the browser-facing process.

The worker split is the one that matters most: embedding 45k products or synchronising AX
has a completely different resource profile and failure mode from serving an editor's page.
Sharing a process would mean a stuck import degrades the UI, and scaling for a nightly batch
would mean over-provisioning the API all day.
