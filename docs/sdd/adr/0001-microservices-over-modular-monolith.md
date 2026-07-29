# ADR-0001 — Domain-Aligned Microservices over a Modular Monolith

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-08 |
| **Deciders** | Chief Architect, Executive Director, Platform Lead |
| **Consulted** | All squad leads |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [06](../06-microservice-design.md), [ADR-0008](0008-sync-vs-async-boundaries.md), [ADR-0011](0011-transactional-outbox.md) |

---

## Context

The platform spans seven substantial domains — grants, finance, HR and payroll, beneficiaries, field data, learning, and analytics — built over roughly sixteen months by three squads plus a platform capability. It is multi-tenant, handles both statutory payroll and beneficiary personal data, and must be deployable without coordinated release trains.

The decomposition question had to be answered before any schema was written, because the boundary choice determines who can deploy independently, who owns which data, and where transactions can span.

Constraints that shaped it:

- Five platform engineers, business-hours-plus-escalation on-call ([26 §26.1](../26-reliability-and-incident-management.md)). Operational surface is genuinely expensive.
- Payroll needs a stricter isolation posture than the rest of the platform ([ADR-0006](0006-per-tenant-schema-for-payroll.md)), which is easier if it is a separable deployment unit.
- Squads need to ship without waiting on each other; a shared release train across three squads was a known failure mode from prior experience.
- Some workloads have very different scaling profiles: payroll is CPU-heavy and bursty, field sync is IO-heavy and bursty on a different calendar, reporting is memory-heavy.

## Decision

**Decompose into fifteen domain-aligned services**, each owning its data, deployed independently, communicating synchronously by REST through an API gateway where a user is waiting and asynchronously by events otherwise.

Boundaries follow the bounded contexts in [07](../07-domain-model-and-erd.md), not technical layers. A service owns its tables; no service reads another's tables directly.

Two constraints make the decomposition survivable rather than merely fashionable:

**One shared service template and one pipeline.** Every service is generated from the same template with observability, tenant context, health probes, error taxonomy and the isolation test harness pre-wired, and every service uses the same pipeline. The marginal cost of the fifteenth service is small because nothing about it is bespoke.

**An explicit tripwire for merging services back.** If any two of the following hold for two consecutive quarters, named services are merged: change failure rate above 15 per cent, lead time for a typical change above five days, more than 30 per cent of changes requiring coordinated deployment across services, or on-call load above two pages per day. The tripwire exists because the honest risk here is a distributed monolith, and pretending otherwise would leave no mechanism to correct it.

## Alternatives considered

**Modular monolith with enforced module boundaries.** Genuinely attractive, and the closest call in this ADR. It would give local transactions across domains, a single deployment, one runtime to patch, far simpler debugging, and no network between modules. Rejected for three specific reasons rather than a general preference: payroll's isolation posture is much harder to enforce structurally inside one process holding one connection pool; three squads sharing one deployment unit means every release is a negotiation, and at a sixteen-month build that compounds badly; and the scaling profiles differ enough that a monolith would be sized for the union of its peaks. The counter-argument — that module boundaries can be enforced with lint rules and that a monolith can be split later — is true in principle and rarely true in practice once shared tables exist.

**Coarse decomposition into three or four services** along squad lines. Fewer deployment units, less operational surface. Rejected because squad-shaped services are the wrong boundary: squads change composition, domains do not, and a service that follows the org chart has to be re-cut every reorganisation.

**Serverless functions per capability.** Rejected: cold starts are unacceptable on the latency budget, per-request tenant context setup with a connection pool is awkward, observability is harder, and the operational model does not fit a team that needs to debug a payroll run.

**One service per aggregate**, on the order of forty services. Rejected as obviously beyond the team's operational capacity; the coordination cost would exceed any benefit.

## Consequences

**Positive.** Independent deployability, which is the property being bought. Clear data ownership with no ambiguity about who may write a table. Payroll can be isolated structurally. Failure is partial rather than total, and the criticality tiers in [06](../06-microservice-design.md) make degradation designed rather than accidental. Scaling is per-workload.

**Negative, and these are real.** No cross-domain transaction: consistency across services is eventual, which required the transactional outbox ([ADR-0011](0011-transactional-outbox.md)) and idempotent consumers, and it means some workflows are harder to reason about than a single `COMMIT`. Debugging spans services, which required distributed tracing as a Phase 1 deliverable rather than a later convenience. Fifteen services means fifteen sets of dependencies to patch and fifteen deployments to observe. A schema change with cross-service impact needs an expand-contract dance and event versioning. Local development needs Docker Compose rather than a single process.

**Accepted risk.** R-04 in [01 §7](../01-executive-summary.md): microservice complexity outrunning team capacity. The tripwire above is the mitigation, and it is written down precisely so that invoking it is a normal engineering decision rather than an admission of failure.
