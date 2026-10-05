# Architecture Decision Records

Each ADR records **one** decision: the context that forced it, what was decided, what else
was considered, and what the decision costs us.

An ADR is immutable once accepted. To change a decision, write a new ADR that supersedes it
and update the status of the old one — never edit history.

| #                                                               | Decision                                                | Status   |
| --------------------------------------------------------------- | ------------------------------------------------------- | -------- |
| [001](./ADR-001-modular-monolith.md)                            | Modular monolith, not microservices                     | Accepted |
| [002](./ADR-002-hexagonal-architecture.md)                      | Hexagonal architecture (ports & adapters)               | Accepted |
| [003](./ADR-003-monorepo-platform-two-repositories.md)          | One platform monorepo + one infrastructure repo         | Accepted |
| [004](./ADR-004-aws-ecs-fargate.md)                             | AWS ECS Fargate as the runtime                          | Accepted |
| [005](./ADR-005-postgresql-pgvector.md)                         | PostgreSQL + pgvector as the single datastore           | Accepted |
| [006](./ADR-006-sqs-eventbridge-no-redis.md)                    | Amazon SQS + EventBridge, no Redis                      | Accepted |
| [007](./ADR-007-openai-provider-adapter.md)                     | OpenAI behind provider ports                            | Accepted |
| [008](./ADR-008-site-to-site-vpn.md)                            | Site-to-Site VPN to the CDR network                     | Accepted |
| [009](./ADR-009-database-access-library.md)                     | Drizzle ORM + hand-written SQL migrations               | Accepted |
| [010](./ADR-010-iac-terraform.md)                               | Terraform for infrastructure as code                    | Accepted |
| [011](./ADR-011-unified-code-inheritance-and-homolog-search.md) | Unified-code inheritance and homolog search eligibility | Accepted |
| [012](./ADR-012-template-driven-product-data.md)                | Template-driven dynamic product data                    | Accepted |
| [013](./ADR-013-capability-and-attribute-authorization.md)      | Capability and attribute-level authorization            | Accepted |
