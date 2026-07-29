# ADR-0016 — Single Primary Region with Warm Standby, not Active-Active

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-05-18 |
| **Deciders** | Platform Lead, Chief Architect, Executive Director |
| **Consulted** | Data Architect, DPO |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [27](../27-disaster-recovery-and-bcp.md), [ADR-0014](0014-gke-and-region-selection.md) |

---

## Context

The platform runs in `africa-south1` with regional high availability: Cloud SQL with a synchronous standby in a second zone, and GKE nodes across three zones. A zone failure is handled automatically with an RTO of about 60 seconds and no data loss.

A **region** failure is a different problem. It requires a decision about how much complexity and cost to spend on how much recovery speed.

The commitments being sized against: 99.5 per cent availability, RTO of 4 hours for a regional failure, RPO of 5 minutes ([30 RE-07, RE-08](../30-quality-attributes-nfr.md)). Those numbers were set with tenants: an NGO can tolerate a half-day outage of their management platform provided field capture continues on devices, which it does by design ([13](../13-offline-first-architecture.md)).

## Decision

**Warm standby in `europe-west4`: a cross-region Cloud SQL read replica running continuously, and everything else built on demand from Terraform at failover time.**

| Component | Standing state |
| --- | --- |
| Cloud SQL cross-region replica | **Running continuously**, asynchronous replication |
| Object storage | Continuously replicated |
| Container images | Multi-region Artifact Registry |
| Secrets | Replicated in Secret Manager |
| KMS keys | Available in both regions, verified quarterly |
| Terraform state and manifests | Off-region, in Git and GCS |
| **GKE cluster** | **Not pre-provisioned.** Applied from Terraform at failover, roughly 25 minutes |
| **Application workloads** | Deployed by Argo CD once the cluster exists |

The failover procedure, its timings and its verification steps — including a mandatory tenant isolation canary before DNS cutover — are in [RB-12](../runbooks/rb-12-region-failover.md).

Failover is a **Platform Lead decision**, not an automatic action, because promoting an asynchronous replica accepts a bounded data loss and is partially irreversible.

## Alternatives considered

**Active-active across two regions.** Minutes of RTO and near-zero RPO. Rejected, and it is worth being specific about why rather than gesturing at complexity. It requires either multi-master writes — which for a system with financial approvals, payroll and monotonic audit chains means conflict resolution on data where conflicts are unacceptable — or a globally-consistent store, which changes the data architecture entirely. It roughly doubles infrastructure cost. It introduces a class of failure, split-brain and cross-region replication lag affecting live reads, that a five-person platform capability would be debugging in production. And it buys an RTO improvement from 4 hours to minutes for an event with a likelihood of well under once per three years. The maths does not favour it.

**Hot standby: a full cluster running continuously in the DR region.** Would reduce RTO from about 4 hours to about 45 minutes. Rejected on cost — roughly 400 a month for capacity that is idle almost always — and, more subtly, on a reliability concern: an idle cluster that is never exercised drifts, and a DR cluster that has silently diverged for eight months is a liability at exactly the wrong moment. Building it from Terraform at failover means the build path is the same one exercised in every quarterly drill and every staging rebuild ([30 PO-01](../30-quality-attributes-nfr.md)).

**Backup-restore only, no standing replica.** Cheapest by roughly 6,500 a year, the single largest saving available anywhere in the cost model. Rejected: RPO becomes the backup interval and RTO becomes many hours of restore time on a large database. This is listed in [33 §33.6](../33-cost-model-and-finops.md) as the largest available saving and the least acceptable, and it is worth having that rejection recorded rather than re-litigated annually.

**A second African region.** Would preserve data residency during a failover. Rejected because none exists with the required managed services ([ADR-0014](0014-gke-and-region-selection.md)).

**Multi-cloud DR.** Rejected as disproportionate: two cloud providers to operate, two IaC codebases, two sets of managed service semantics, for a failure mode — total loss of a provider's region with no recovery — already covered.

## Consequences

**Positive.** RPO of about 5 minutes, bounded by replication lag rather than by a backup schedule. RTO of about 4 hours, within the commitment with margin. Cost of roughly 545 a month at Phase 4, against about 6,500 for a comparable active-active posture. No split-brain risk, because there is only ever one primary. The DR build path is exercised continuously in staging and quarterly in drills, so it is a known-good path rather than a theoretical one. The decision is simple to explain to a tenant.

**Negative.** Up to 5 minutes of committed transactions can be lost in a regional failover, and [RB-12](../runbooks/rb-12-region-failover.md) requires that this be stated explicitly to tenants rather than glossed — a tenant who approved a disbursement in the final minutes needs to know to check it. Failover is manual, so time-to-decide is part of the RTO. Promotion is partially irreversible: failback is a separate planned operation, not an undo. During DR operation, capacity is smaller and beneficiary data is temporarily in Europe, which has a residency consequence that must be communicated. And the procedure is genuinely disruptive to execute, which is why it is drilled quarterly rather than trusted.

**Reassessment trigger.** If a tenant contractually requires an RTO under an hour, or if a regional failure actually occurs and the observed cost to tenants exceeds the modelled tolerance, hot standby is the next step — not active-active. [RB-12 §9](../runbooks/rb-12-region-failover.md) requires this decision to be revisited after any real invocation, with data instead of estimates.
