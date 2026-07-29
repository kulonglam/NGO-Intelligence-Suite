# ADR-0005 — Per-Entity Offline Conflict Resolution, not Last-Write-Wins

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-22 |
| **Deciders** | Chief Architect, Product, Field squad lead |
| **Consulted** | Two design-partner programme managers, DPO |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [13](../13-offline-first-architecture.md), [ADR-0013](0013-pwa-over-native-mobile.md) |

---

## Context

Field officers capture data offline for up to 72 hours and sync when connectivity allows ([13 §13.8](../13-offline-first-architecture.md)). Two officers can register the same household on the same day; an officer can edit a beneficiary record that a programme manager also edited in the office; a device with a clock six hours out can sync after a device with a correct clock but earlier captured data.

A conflict policy is therefore unavoidable. The tempting default — last write wins, by server receipt time — is available in every sync framework and is wrong here in a specific and damaging way: **the last write to arrive is frequently the least informed.** An officer whose phone found signal first is not more authoritative than one who spent longer with the household, and a stale office edit arriving after a fresh field capture would silently overwrite ground truth.

Worse, the loss is invisible. Nobody discovers that a vulnerability assessment was overwritten until a decision is made on the wrong data.

## Decision

**Conflict policy is specified per entity, based on who is authoritative for that entity's data, and unresolvable conflicts are surfaced to a human rather than resolved by the platform.**

Four policies, assigned per entity in [13 §13.5](../13-offline-first-architecture.md):

| Policy | Applies to | Behaviour |
| --- | --- | --- |
| **Append-only** | Submissions, assessments, distributions, attendance | No conflict is possible. Each capture is a new immutable record keyed on `client_uuid` for idempotency. **The default, and the reason most captured data has no conflict problem at all** |
| **Field-authoritative** | Beneficiary attributes observed in the field: location, household composition, physical condition | The field value wins, ordered by `captured_at`, not by arrival. The officer was there |
| **Office-authoritative** | Programme enrolment, entitlement, case status, anything with a financial or eligibility consequence | The server value wins. A device may not change an entitlement offline |
| **Human review** | Probable duplicate registrations; concurrent edits to the same field from field and office within a defined window | Both versions retained, flagged, routed to the tenant. **Never merged automatically** |

Three supporting rules:

**`captured_at` and `received_at` are distinct and both preserved.** Ordering uses `captured_at` with device clock skew correction from the sync handshake; `received_at` is for operations, never for semantics.

**A submission binds permanently to the form version it was captured against.** Republishing a form with stricter validation must never invalidate collected data ([RB-16 §6.3](../runbooks/rb-16-sync-failure.md)).

**Duplicate detection flags, it does not merge.** Merging two beneficiary records is a programme decision with protection implications — two records may be two people with the same name, and merging them can erase one person's entitlement.

## Alternatives considered

**Last-write-wins by server receipt time.** Simple, and available for free. Rejected as described: arrival order is uncorrelated with authority, and the data loss is silent. This is the single most consequential rejection in the offline design.

**Last-write-wins by `captured_at`.** Better, and it fixes the arrival-order problem. Still rejected, because it is wrong for office-authoritative fields: a field officer editing an entitlement offline should not win over the finance manager who set it, regardless of timestamps.

**CRDTs, or an operation-based sync model.** The technically elegant answer, giving automatic convergence without conflicts. Rejected for three reasons. The convergent result is not always the *correct* programme result — a CRDT will happily converge a household size to a value neither officer recorded. Payload size grows with operation history, which is unacceptable on 2G. And the implementation and debugging burden is substantial for a small team, on the most safety-critical data path in the platform.

**Always ask the user on the device.** Rejected: an officer in the field is the wrong person to adjudicate a conflict with an office edit they cannot see the context for, and blocking their capture flow to do it is worse than the conflict.

**Locking, or offline reservation of records.** Rejected: requires connectivity to acquire a lock, which is exactly what is absent.

## Consequences

**Positive.** No silent data loss, which is the property being bought. Field observations are trusted where officers are authoritative. Financial and eligibility data cannot be changed from a device. Append-only covers the large majority of captured volume, so the conflict machinery applies to a narrow set of cases. Conflicts become a visible, reviewable queue rather than an invisible overwrite.

**Negative.** More implementation complexity than a single global rule, and the per-entity table in [13 §13.5](../13-offline-first-architecture.md) is a specification that must be kept accurate as entities are added — rule 1 in [34 §34.5](../34-future-extensibility.md) exists partly for this. Tenants must staff conflict review; a queue nobody looks at is a different failure. Clock skew correction is fiddly and needed a dedicated test scenario ([23 §23.8](../23-testing-strategy.md)). Officers occasionally see a rejected edit on an office-authoritative field, which needs a clear explanation in the UI rather than a generic error.

**Firm boundary.** The platform never resolves a review-queue conflict on a tenant's behalf, including during an incident. [RB-16 §6.5](../runbooks/rb-16-sync-failure.md) states this as an explicit "do not", because the temptation to clear a large queue during an incident is real and doing so would be making programme decisions for an organisation that did not ask us to.
