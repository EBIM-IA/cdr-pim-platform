# ADR-010 — Terraform for infrastructure as code

**Status:** Accepted · 2026-08-30

## Context

Two fully independent AWS environments (QAS and PRD) must be reproducible, reviewable and
auditable, and must not share RDS instances, S3 buckets, SQS queues, secrets, ECS services
or critical security groups. The infrastructure spans VPC, Site-to-Site VPN, ECS, ALB, RDS,
S3, SQS, EventBridge, ECR, Secrets Manager, IAM and CloudWatch.

## Decision

**Terraform**, in its own repository (`cdr-pim-infrastructure`), structured as reusable
modules composed per environment.

```
modules/     network vpn ecs alb rds s3 sqs eventbridge ecr secrets monitoring security
environments/qas   environments/prd
```

- Each environment is a separate root module with its **own state file** and its own
  `terraform.tfvars`. A `terraform apply` in QAS cannot touch PRD, because the PRD state is
  not in scope.
- **Remote state in S3 with native locking** (`use_lockfile`), versioning and encryption
  enabled. No DynamoDB table is needed — S3 conditional writes provide locking natively.
- **No secret values in the repository.** Terraform _creates_ Secrets Manager secrets and
  their access policies; the values are populated out of band. `.tfvars` files carrying
  secrets are git-ignored, and the VPN pre-shared key is a `sensitive` variable.
- Provider and module versions are pinned; `.terraform.lock.hcl` is committed.
- CI runs `fmt -check`, `validate` and `tflint`/`tfsec` on pull requests. **`apply` is never
  automatic for PRD** — it is a reviewed, manually approved step.

## Alternatives considered

**AWS CDK (TypeScript).** Genuinely attractive: the same language as the platform, real
abstractions, unit-testable constructs. Rejected because the generated CloudFormation is what
actually runs, so the diff a reviewer approves is not the artefact that executes — and
CloudFormation's failure and rollback behaviour is markedly harder to reason about than a
Terraform plan. For infrastructure that includes a VPN into a customer's network, "the plan
shows exactly what will change" outweighs language familiarity.

**Pulumi.** Same appeal, same objection, plus a smaller ecosystem and a hosted state service
to either adopt or replace.

**CloudFormation / SAM directly.** Rejected: verbose, weaker module composition, and no plan
output of comparable quality.

**Console-driven ("ClickOps").** Rejected. Two environments cannot be kept identical by
hand, and nothing is reviewable or reproducible.

**OpenTofu.** A viable drop-in given Terraform's BUSL licence, and the code here is
compatible with it. Terraform was chosen for ecosystem and documentation familiarity; moving
to OpenTofu later is a binary swap, which is why this is a low-stakes decision.

## Consequences

- Environments are diffable: the difference between QAS and PRD is a `.tfvars` file plus a
  handful of module arguments (Multi-AZ, instance size, task count, deletion protection).
- Every infrastructure change is a pull request with a `plan` attached.
- Naming is systematic — `cdr-pim-{qas|prd}-*` — so IAM policies, cost allocation and
  CloudWatch queries can be scoped by prefix.

## Trade-offs

- **State is critical infrastructure.** A lost or corrupted state file is a serious incident.
  Mitigated by S3 versioning plus encryption; the recovery procedure belongs in the infra
  repository's runbook.
- **Terraform is BUSL-licensed.** Not a problem for internal use; OpenTofu is the escape
  hatch if that ever changes.
- **Drift is possible.** A console change is invisible until the next plan. `plan` should be
  run on a schedule, not only on pull requests.
- **Two repositories means cross-repo coordination** for changes that span both — a new SQS
  queue needs a Terraform change and an application configuration change, in that order.
