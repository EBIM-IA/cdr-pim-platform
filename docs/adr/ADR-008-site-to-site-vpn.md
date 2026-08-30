# ADR-008 — AWS Site-to-Site VPN to the Casa del Rulimán network

**Status:** Accepted · 2026-08-30

## Context

Dynamics AX 2012 R2 runs on Casa del Rulimán's internal network, as — potentially — do
PrestaShop and the order-taking application. The PIM runs in AWS and must reach them.

AX 2012 R2 is a 2012-era product. It must not be exposed to the internet under any
circumstance: its attack surface is not something a 2026 security posture can accept, and
publishing it would also mean publishing whatever else shares its network segment.

## Decision

**An AWS Site-to-Site VPN between the PIM's VPC and the CDR network**, with all
PIM→internal traffic flowing through the tunnel.

```
ECS task (private subnet) → route table → Virtual Private Gateway
    → IPsec tunnel → CDR customer gateway → AX / internal APIs
```

- Two tunnels (AWS provides them by default) for redundancy.
- Routing is **specific, not default**: only the CDR CIDR blocks route over the VPN.
  Internet-bound traffic (ECR, OpenAI) continues through the NAT gateway.
- Security groups permit egress only to the specific internal hosts and ports the
  integration needs — not to the whole internal range.
- Only the **worker** needs this path (AX synchronisation is a background job). The API's
  security group does not get VPN egress until something proves it needs it.
- The pre-shared key lives in AWS Secrets Manager and is referenced by Terraform variable.
  It is never written to a `.tfvars` file in the repository.

### Inputs required from Casa del Rulimán

None of the following is invented; the Terraform module declares the variables and the plan
cannot run until CDR supplies real values:

| Item                                                          | Why                                        |
| ------------------------------------------------------------- | ------------------------------------------ |
| Public IP of the VPN gateway/firewall                         | Customer gateway definition                |
| Device vendor/model and software version                      | AWS provides a matching configuration file |
| Internal CIDR blocks to be reachable                          | Static routes and security group rules     |
| BGP ASN, or confirmation of static routing                    | Routing mode                               |
| Host/IP and port of AX and any internal API                   | Least-privilege security group rules       |
| Internal DNS servers, if hostnames are used                   | Route 53 Resolver outbound endpoint        |
| Confirmation that CDR's firewall permits the VPC CIDR inbound | The tunnel is useless otherwise            |
| Change window and technical contact                           | Coordinated bring-up                       |

Until these exist, `AxProductSourceAdapter` remains a stub that throws a documented
`DependencyUnavailableError`, and `IntegrationsModule` binds the in-memory source instead.

## Alternatives considered

**AWS Direct Connect.** Rejected for now. Better latency and dedicated bandwidth, but it
costs an order of magnitude more, takes weeks to provision, and the traffic profile here
(periodic delta synchronisation, not continuous bulk transfer) does not justify it. The VPN
can be replaced by, or complemented with, Direct Connect later without changing anything in
the application.

**Exposing AX through a public API gateway or reverse proxy.** Rejected outright. It puts a
2012 ERP on the internet.

**A CDR-hosted agent pushing data out to AWS.** Genuinely viable, and avoids inbound
connectivity entirely. Rejected as the primary design because it requires CDR to build,
deploy and operate software on their side, and because it makes on-demand reads (fetch one
product by AX item id) impossible. Worth revisiting if the VPN proves hard to establish —
`ErpProductSourcePort` accommodates either direction.

**Tailscale or a similar overlay.** Rejected: a third-party dependency in the security path,
plus software to install on CDR machines, for a problem AWS solves natively.

## Consequences

- AX is never exposed publicly, and only the worker's security group can reach it.
- The integration is a routing and firewall concern, not an application concern: the adapter
  connects to an internal address as if it were local.
- Latency over an IPsec tunnel is real (tens of milliseconds), which reinforces batch
  synchronisation over chatty per-record calls.

## Trade-offs

- **A shared dependency on CDR's network team.** The tunnel cannot be brought up, tested or
  debugged unilaterally. This is the single largest external delivery risk.
- **Bandwidth ceiling** (~1.25 Gbps per tunnel) and no SLA on internet-path quality. Fine for
  delta synchronisation; a full 45k-SKU reload should be scheduled off-hours.
- **A tunnel is a stateful thing that can go down.** Its CloudWatch `TunnelState` metric
  needs an alarm, and `AX_SYNC` must degrade to "retry later" rather than fail loudly —
  which the queue's retry policy already provides.
