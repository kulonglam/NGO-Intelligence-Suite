# ADR-0019 — Build an Extension Point Only on the Second Concrete Case

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-06-10 |
| **Deciders** | Chief Architect |
| **Consulted** | All squad leads, Product |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [34](../34-future-extensibility.md) |

---

## Context

Design review repeatedly produced proposals to generalise: a plugin system for report types, a rules engine for approval workflows, a generic connector framework for integrations, configurable entity schemas. Each was argued on the same basis — that a future tenant will want something we cannot anticipate, so the shape should be open.

The pull is understandable and, at this stage of a platform, usually wrong. An extension point that no second case exercises is an interface maintained for nobody: it is code, tests, documentation and a compatibility promise, and it constrains the internals it abstracts. The generalisation is also usually wrong, because a single example does not reveal which axis actually varies. The rules engine designed for one approval workflow rarely fits the second one.

There is a specific version of this failure worth naming: a plugin system that runs third-party code near beneficiary data. That is not merely speculative complexity, it is a security boundary we would have to defend forever.

## Decision

**An extension point is built when a second concrete case exists. Not when a second case is imaginable.**

"Concrete" means a named tenant with a stated requirement, or a committed roadmap item — not a plausible scenario.

Three exceptions, where the point is built in advance because retrofitting would require restructuring rather than addition:

| Built in advance | Why the exception holds |
| --- | --- |
| **Payroll jurisdiction rules** | Two jurisdictions exist at launch, so the second case is already present. A third must be a rule module plus effective-dated data, never a fork of the engine — a jurisdiction-specific branch in the engine would make statutory correctness unverifiable |
| **Event subscription (webhooks)** | The outbox and stream topology already exist; a webhook fan-out is just another consumer. The design cost now is close to zero and the retrofit cost is also low, but designing the payload rule in advance matters ([34 §34.2.2](../34-future-extensibility.md)) |
| **Form and questionnaire definitions** | Dynamic definitions are a Phase 3 requirement, not a future one, and version binding must be right from the first submission |

For everything else, the architecture maintains **seams** rather than extension points: bounded contexts with owned data, anti-corruption layers per external system, provider clients behind interfaces, cloud coupling confined to the IaC layer, and `tenant_id` on every table so sharding remains possible. A seam costs nothing to maintain because it is a consequence of decisions made for other reasons.

## Alternatives considered

**Design for extensibility throughout**, with plugin points at every plausible variation. Rejected: it is the classic speculative-generality failure. Every abstraction is a bet, and betting on twelve at once at this stage guarantees mostly losses, each with a maintenance cost.

**A general plugin system with third-party code execution.** Rejected on security grounds primarily. Running tenant-supplied or marketplace code in a process with access to beneficiary data would require sandboxing, resource limits, an audited capability model and a review process — a substantial security programme for demand that does not exist ([34 §34.4](../34-future-extensibility.md)).

**A rules engine for approvals and workflow.** Rejected: the approval flows in the platform are few and stable, and a rules engine would make them harder to reason about, harder to test and harder to audit. A maker-checker rule enforced by a database constraint is verifiable; the same rule expressed in a configurable engine is not, and the payroll separation-of-duties control depends on that verifiability ([30 SE-06](../30-quality-attributes-nfr.md)).

**Configurable entity schemas** — letting tenants add arbitrary fields to core entities. Rejected except within form definitions, where it is scoped and where any field marked as personal data automatically inherits encryption, classification and retention. Unconstrained custom fields on core entities would allow a tenant to create an unprotected PII field, which is precisely the failure the classification gate exists to prevent.

**No extensibility thinking at all**, refactoring purely on demand. Rejected: some seams genuinely cannot be added later. The sharding seam is the clearest example — it exists only because no domain query joins across tenants, a discipline adopted for isolation reasons that happens to keep the door open. Had convenience been chosen there, both properties would be lost.

## Consequences

**Positive.** Less code, fewer interfaces, fewer compatibility promises. Internals stay changeable, because nothing external depends on their shape. Review effort goes to the code that runs rather than to abstractions that do not. No third-party code executes near beneficiary data. The three real extension points are each grounded in a case that exists, so they are shaped by evidence rather than imagination.

**Negative.** The first instance of a new variation costs more than it would with an extension point already in place — a second payment provider means writing an adapter rather than configuring one, and the first tenant asking for something genuinely novel waits longer. Some refactoring is inevitable when the second case arrives, and it will occasionally be awkward. There is also a cultural cost: telling an engineer that their proposed abstraction is premature is an unpopular thing to do, and doing it repeatedly requires the reasoning to be written down, which is what this ADR is for.

**How to apply it in review.** The question is not "could something vary here?" — the answer is always yes. It is "what is the second case, who is it for, and what does it need?" If those cannot be answered, the seam is enough.
