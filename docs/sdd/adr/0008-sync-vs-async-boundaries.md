# ADR-0008 — Synchronous Only When the User Is Waiting

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-14 |
| **Deciders** | Chief Architect |
| **Consulted** | All squad leads |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [11](../11-event-driven-architecture.md), [ADR-0001](0001-microservices-over-modular-monolith.md), [ADR-0003](0003-redis-streams-over-kafka.md) |

---

## Context

With fifteen services ([ADR-0001](0001-microservices-over-modular-monolith.md)), every interaction between them is a choice: a synchronous HTTP call, or an event.

Made case by case, that choice drifts toward synchronous, because a direct call is the easier thing to write and its result is immediately available. The accumulated result is a distributed monolith: a request that touches six services in sequence, whose availability is the product of theirs and whose latency is their sum, and where any one of them being slow makes the whole thing slow.

The observable symptom is that a Tier 3 service being down breaks a Tier 1 workflow, which is precisely the outcome the criticality tiers in [06](../06-microservice-design.md) exist to prevent.

## Decision

**Synchronous if and only if the user is waiting on the result. Asynchronous otherwise.**

A single question decides it: *if this call failed, would the user's operation be wrong, or merely incomplete later?* If wrong, synchronous. If incomplete later, an event.

| Interaction | Mode | Reasoning |
| --- | --- | --- |
| Gateway to any service for a user request | Sync | The user is waiting |
| Any service to `auth-service` for permission resolution | Sync, cached 60 s | The answer is required to proceed |
| `hr-payroll-service` reading a grant's cost centres from `grant-service` before allocating | Sync | The decision depends on it being current |
| Writing an audit record | **Async** | The mutation is not wrong if the audit write is queued |
| Sending a notification | **Async** | Nobody is waiting on an email |
| LMS enrolment on employee onboarding | **Async** | Onboarding is complete without it |
| Dashboard aggregation | **Async** | Eventual by nature |
| IATI staging | **Async** | Publication is a scheduled activity |
| Payroll run execution | **Async job with status polling** | Minutes long; a synchronous request would time out and hold a connection |
| Report generation | **Async job** | Same |
| Field sync submission acceptance | **Sync commit, async processing** | The device must know the data is durable; aggregation can follow |

Three supporting rules make the boundary hold:

**No synchronous call may be more than two hops deep.** Gateway to service, service to at most one other. A three-hop chain is a design smell and needs an ADR of its own.

**No external call inside a database transaction**, ever ([35 §35.4.2](../35-engineering-standards.md)). An HTTP request holding a transaction open is how a connection pool is exhausted.

**Every synchronous cross-service call has a timeout, a circuit breaker, and a documented behaviour when it opens.** A dependency with no declared degradation is not an approved dependency.

## Alternatives considered

**Synchronous by default, asynchronous only where clearly needed.** The path of least resistance and the one that produces the distributed monolith described above. Rejected because "clearly needed" is judged at the moment of writing one call, when the cumulative effect is invisible.

**Asynchronous everywhere, including reads.** The fully event-driven position, with every service maintaining local read models of what it needs. Rejected: a user approving a disbursement must see the current remaining budget, not a projection that may lag. Eventual consistency on a financial control is not acceptable, and building read models for every cross-domain read would multiply the data to keep correct.

**Synchronous calls with generous retries instead of events.** Rejected: retries on a slow dependency amplify load precisely when it is struggling, and they do not survive the caller restarting.

**A saga or process manager for every multi-service workflow.** Considered for the workflows that genuinely need coordination. Adopted narrowly — tenant provisioning is an orchestrated job — and rejected as a general pattern, because most workflows here are notifications of fact rather than coordinated transactions, and a saga for each would be substantial machinery for no gain.

## Consequences

**Positive.** Tier 1 workflows do not depend on Tier 2 or Tier 3 availability, which is what makes the degradation table in [06](../06-microservice-design.md) truthful rather than aspirational. Latency budgets are achievable because the critical path is short. Failure is contained: `notification-service` being down delays emails and breaks nothing. Load spikes are absorbed by queues rather than propagated.

**Negative.** Users see eventual consistency in places, and the UI has to be honest about it — a dashboard says when it was last updated rather than implying it is live. Event processing lag becomes a user-visible symptom with its own diagnosis path ([RB-16 §6.5](../runbooks/rb-16-sync-failure.md)), and "the data is there but not visible yet" is a support conversation that would not exist in a synchronous design. Debugging a workflow spans a trace rather than a stack, which made distributed tracing a Phase 1 requirement. Idempotency is mandatory on every consumer, because at-least-once delivery is the guarantee available.

**The rule that gets tested.** The two-hop limit is the one most likely to be breached quietly, because the third hop always looks locally reasonable. It is checked in API design review ([35 §35.6](../35-engineering-standards.md)) rather than automatically, which is a weakness worth acknowledging: a lint rule for it would be better if a reliable one could be written.
