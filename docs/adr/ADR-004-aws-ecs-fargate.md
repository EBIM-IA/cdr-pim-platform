# ADR-004 — AWS ECS Fargate as the container runtime

**Status:** Accepted · 2026-08-30

## Context

The platform is three long-running processes (web, API, worker) that must run in AWS, reach
Casa del Rulimán's internal network over a Site-to-Site VPN, and be operated by a small team
with no dedicated platform engineer. Two independent environments are required, QAS and PRD,
with no shared infrastructure.

## Decision

Run every process as an **ECS service on AWS Fargate**, one task definition per app per
environment, with images stored in **Amazon ECR**.

- Web and API sit behind an **Application Load Balancer**; the worker has no listener and no
  target group.
- Tasks run in **private subnets**. Outbound internet (ECR pulls, OpenAI) goes through a NAT
  gateway; inbound arrives only via the ALB.
- Each task gets its own **IAM task role** scoped to exactly the resources it uses. The
  worker's role can read its queue and write to S3; the API's role can send to the queue.
  Neither can read the other's secrets.
- Secrets are injected from **AWS Secrets Manager** through the task definition's `secrets`
  block, so they exist as process environment variables and never as files or image layers.
- Health checks: the ALB target group polls `/api/v1/health/ready`; the container health
  check polls `/health/live`.

## Alternatives considered

**EKS / Kubernetes.** Rejected. It is the right answer at a scale this project is nowhere
near. It would add a control plane to operate, a cluster to upgrade, and a body of knowledge
the team would have to acquire before shipping any product feature. The brief explicitly
rules it out.

**EC2 with Docker Compose or an ASG.** Rejected. Cheaper per vCPU, but the team then owns
AMI patching, instance draining, capacity planning and deployment orchestration. Fargate
trades money for exactly the work we do not want to do.

**AWS App Runner.** Tempting for the API's simplicity, but rejected: VPC egress support is
more constrained, per-task IAM and networking are less controllable, and the worker (no HTTP
listener) does not fit the model at all. Using two different runtimes for two halves of one
system is worse than using one that fits both.

**Lambda.** Rejected — see ADR-001. Long-running imports and embedding batches, plus the
need for stable VPC networking to the VPN, make it a poor fit.

## Consequences

- No servers to patch. Capacity is a number in Terraform.
- Every deployment is an immutable image referenced by digest, which is what makes
  build-once-promote (ADR-003, `DEPLOYMENT_STRATEGY.md`) actually enforceable.
- ECS rolling deployments with a circuit breaker give automatic rollback when the new
  revision fails its health checks.
- Migrations run as a **one-off ECS task** from the same image, before the service is
  updated — never from inside a serving container.

## Trade-offs

- **Higher unit cost** than EC2 for steady-state load. At three small services this is a
  rounding error next to an engineer's time.
- **Cold-ish starts on scale-out** (image pull plus boot, tens of seconds). Mitigated by
  keeping a minimum task count above one in PRD and by small images.
- **A NAT gateway is a fixed monthly cost** and a bandwidth charge. Accepted: private
  subnets with controlled egress are a security baseline, not an optimisation. VPC endpoints
  for ECR/S3/Secrets Manager can cut most of the traffic later if it matters.
- **Fargate is amd64/arm64 but not both in one task.** Developer machines here are arm64, so
  CI must build with `--platform linux/amd64` (or the task definition must specify arm64).
  This is a real, easy-to-miss footgun; it is called out in `DEPLOYMENT_STRATEGY.md`.
