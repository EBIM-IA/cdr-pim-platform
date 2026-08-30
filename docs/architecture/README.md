# Architecture documentation

| Document                                                     | Answers                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| [SYSTEM_CONTEXT.md](./SYSTEM_CONTEXT.md)                     | Who uses the PIM and what it talks to (C4 level 1)              |
| [CONTAINER_ARCHITECTURE.md](./CONTAINER_ARCHITECTURE.md)     | What is deployed and how the pieces communicate (C4 level 2)    |
| [MODULE_ARCHITECTURE.md](./MODULE_ARCHITECTURE.md)           | The bounded contexts, their status and their rules (C4 level 3) |
| [HEXAGONAL_ARCHITECTURE.md](./HEXAGONAL_ARCHITECTURE.md)     | The layering rules and how they are enforced                    |
| [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md)               | The schema, the migration workflow, pgvector                    |
| [AWS_ARCHITECTURE.md](./AWS_ARCHITECTURE.md)                 | VPC, subnets, ECS, RDS, and the VPN to CDR                      |
| [INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md) | AX, PrestaShop, orders — and what CDR still has to provide      |
| [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md)                   | Embeddings, re-embedding, model versioning, cost control        |
| [SECURITY_BASELINE.md](./SECURITY_BASELINE.md)               | Authentication, secrets, IAM, encryption, what is not done yet  |
| [OBSERVABILITY.md](./OBSERVABILITY.md)                       | Logging, health probes, metrics and the alarms that matter      |
| [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md)               | Getting a working environment and the day-to-day loop           |
| [DEPLOYMENT_STRATEGY.md](./DEPLOYMENT_STRATEGY.md)           | Branching, build-once-promote, migrations, rollback             |

Decisions live in [`../adr/`](../adr/). This folder describes _what is_; the ADRs record
_why_, and what was rejected.
