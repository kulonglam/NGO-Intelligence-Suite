# ADR-0007 — TypeScript on Node.js 20 LTS Across All Services

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-08 |
| **Deciders** | Chief Architect, Executive Director |
| **Consulted** | All squad leads, Platform Lead |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [06](../06-microservice-design.md), [35 §35.10](../35-engineering-standards.md) |

---

## Context

Fifteen backend services and a Vue 3 frontend, built by three squads plus a platform capability over sixteen months, operated by five platform engineers with business-hours-plus-escalation on-call.

The runtime choice is mostly a question about people and operations rather than about language merit. Every runtime added means another set of dependency advisories to triage, another base image to patch, another profiler to know, another set of failure modes to recognise at 2 a.m., and another skill set to hire for.

The team's existing depth is in TypeScript and Node.

## Decision

**TypeScript in `strict` mode on Node.js 20 LTS for every backend service, and TypeScript for the frontend. One runtime, one language, one toolchain.**

Enforced by the standards in [35 §35.4.1](../35-engineering-standards.md): `strict` on, no `any` in domain code, build fails on a type error. Express for HTTP, Zod for boundary and configuration validation, Jest for unit and integration tests, `pg` with PgBouncer for the database.

**No second backend language without an ADR.** Stated as a constraint (CON-01 in [04](../04-architecture-principles.md)) and as a Hold on the tech radar, because the cost of a second runtime falls on the same five people regardless of which squad introduced it.

## Alternatives considered

**Go for the backend.** Better CPU performance, lower memory, straightforward concurrency, single static binary, and a genuinely better fit for the payroll computation and the outbox relay. Rejected on team capability and hiring: the team would be learning Go while building statutory payroll, which is the worst possible combination of novel language and unforgiving correctness requirement. Shared types between backend and frontend would also be lost, and the code generation to recover them is a maintenance burden of its own.

**Python for the backend.** Strong data and analytics ecosystem, which would suit the reporting and scoring work. Rejected: weaker static typing story even with type hints, no type sharing with the frontend, and the team's depth is not there.

**Java or Kotlin on the JVM.** Mature, excellent tooling, strong typing. Rejected on operational weight for a small team: JVM tuning, memory footprint per service across fifteen services, and slower startup, which matters for horizontal autoscaling on sync bursts.

**Polyglot by workload** — Node for the API-shaped services, Go for payroll and the relay. Technically the best-fitting answer, and rejected deliberately. It doubles the supply-chain surface, the base images, the CI toolchains and the on-call knowledge requirement, in exchange for performance headroom that the capacity model in [25](../25-performance-and-capacity.md) says is not needed. The place where it would have mattered — payroll — is bounded by database IO rather than CPU in practice.

**Deno or Bun.** Attractive tooling and performance. Rejected as too young for a platform holding statutory payroll and beneficiary data, with a thinner library ecosystem and less certain long-term support.

## Consequences

**Positive.** Types shared between frontend and backend, so an API contract change surfaces as a compile error in the client rather than a runtime failure in the field. One toolchain, one set of lint and Semgrep rules, one base image to patch, one profiler. Any engineer can review any service, which matters at this team size more than specialisation would. Hiring targets a single, large talent pool. Fast startup suits the autoscaling profile.

**Negative, and they need managing rather than denying.** Node is single-threaded per process, so CPU-bound work blocks the event loop: payroll runs on a dedicated node pool with worker threads for the computation, and this needed explicit design rather than being free ([21 §21.3](../21-deployment-and-infrastructure.md)). The npm ecosystem has a broad transitive dependency surface, which is why the supply-chain controls in [22 §22.8](../22-cicd-release-supply-chain.md) are as strict as they are. Numeric handling requires care: JavaScript numbers are IEEE-754 doubles, so every monetary value stays a string end to end and arithmetic happens in PostgreSQL `NUMERIC` or a decimal library, enforced by a Semgrep rule that fails the build on floating-point arithmetic in a money path. Memory-heavy report generation needs bounded streaming rather than in-memory assembly.

**Reassessment trigger.** If a workload appears whose CPU profile cannot be met — a large-scale statistical model, image processing at volume — the correct response is a single, isolated service in a fitter language with its own ADR, not a general relaxation of the constraint.
