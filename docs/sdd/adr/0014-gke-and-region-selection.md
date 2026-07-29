# ADR-0014 — Google Cloud, GKE Standard, and `africa-south1` as Primary Region

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-05-06 |
| **Deciders** | Platform Lead, Chief Architect, Executive Director |
| **Consulted** | DPO |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [21](../21-deployment-and-infrastructure.md), [ADR-0016](0016-single-region-with-warm-dr.md), [17 §17.10](../17-privacy-and-compliance.md) |

---

## Context

Three coupled decisions: which cloud, which orchestration model, and which region.

The constraints that mattered:

**Latency to users in East Africa.** Users are in South Sudan, Uganda, Kenya and Ethiopia, on connectivity where every additional 100 ms of round trip is felt, particularly during sync.

**Data residency.** Beneficiary personal data about people in conflict settings, with a stated commitment that it remains in the configured region ([17 §17.10](../17-privacy-and-compliance.md)). Hosting in Europe or North America is legally workable but a weaker position to explain to a tenant, and to the people in the data.

**Operability by five engineers.** Managed services are not a luxury; they substitute for headcount that does not exist.

**Non-profit pricing and predictable cost**, per the ceiling in [33](../33-cost-model-and-finops.md).

## Decision

**Google Cloud Platform, GKE Standard, primary region `africa-south1` (Johannesburg), DR region `europe-west4` (Netherlands).**

| Choice | Reason |
| --- | --- |
| GCP | `africa-south1` availability, Cloud SQL for PostgreSQL maturity including cross-region replicas and PITR, credible non-profit pricing, Workload Identity as a clean secretless model |
| GKE **Standard**, not Autopilot | Node pool control is needed: payroll and reporting run on a separate high-memory pool ([21 §21.3](../21-deployment-and-infrastructure.md)), and Autopilot's restrictions on pod-level configuration would constrain the pod security context and DaemonSet-based observability. Autopilot remains the documented fallback if operating node pools proves too costly in attention |
| `africa-south1` primary | Roughly 40–80 ms from Nairobi and Kampala against 150–200 ms from `europe-west1`. Beneficiary data stays on the continent, which is the stronger position both legally and ethically |
| `europe-west4` DR | The nearest region with full service parity and independent failure characteristics. There is no second African region with the required services |

## Alternatives considered

**AWS, `af-south1` (Cape Town).** A genuinely close call, and the alternative that would have been chosen on a coin flip in some respects: comparable region, RDS for PostgreSQL is mature, and the ecosystem is larger. Rejected on two margins. Cloud SQL's operational ergonomics for PITR and cross-region replica promotion are, on the team's assessment, simpler to operate correctly under pressure, and [RB-11](../runbooks/rb-11-backup-restore-drill.md) and [RB-12](../runbooks/rb-12-region-failover.md) depend on that. GCP's non-profit pricing was also more favourable at the modelled scale. Not a large margin, and this ADR would not be embarrassing if reversed.

**Azure.** Rejected: no South African region with the required managed PostgreSQL configuration at assessment time, and the team has no operational experience with it.

**A European region as primary** — `europe-west1` or `europe-west4`. Cheaper, more mature, more services. Rejected on latency to actual users and on the residency position. Serving African NGOs' beneficiary data from Europe is defensible but not preferable, and the 100 ms of additional round trip is paid on every sync request by users on the worst connectivity.

**A regional provider or on-premises hosting in East Africa.** Considered seriously for the residency and sovereignty argument. Rejected on the operational reality: no equivalent to managed PostgreSQL with verified PITR, no KMS, and power and connectivity reliability that would make the availability commitment undeliverable. This is a real trade-off — the strongest sovereignty position is the one we cannot operate.

**GKE Autopilot.** Rejected as primary because of node pool and pod configuration constraints, but explicitly retained as a fallback. If node pool management proves to consume attention the platform capability cannot spare, moving to Autopilot is a bounded change and the loss — a shared pool for payroll and reporting — is acceptable.

**Cloud Run for the services.** Attractive for its operational simplicity. Rejected: cold starts against the latency budget, awkward per-request tenant context with connection pooling, and the observability model does not fit the self-hosted stack in [ADR-0017](0017-self-hosted-observability-stack.md).

## Consequences

**Positive.** Best available latency to users. Beneficiary data on the African continent, which is both a compliance and a credibility position. Managed database with the HA, PITR and cross-region replication the RPO and RTO commitments in [27](../27-disaster-recovery-and-bcp.md) depend on. Workload Identity removes a whole class of credential handling. Node pool control where the workload genuinely needs it. Favourable pricing.

**Negative.** `africa-south1` has fewer services and later feature availability than `europe-west1` or `us-central1`; occasionally a service we would like is not there yet. Egress from South Africa is more expensive than from Europe, which is visible in the cost model ([33 §33.2.2](../33-cost-model-and-finops.md)). GKE Standard means node upgrades, node pool sizing and version skew are ours to manage. Cloud coupling is real: Cloud SQL, Memorystore, KMS, Secret Manager and Cloud Storage are all GCP-specific, and while the coupling is confined to the IaC layer ([34 §34.3](../34-future-extensibility.md)), a provider migration would be a substantial project rather than a configuration change.

**Support cost of the region choice.** DR in `europe-west4` means a regional failover moves beneficiary data to Europe temporarily. That is a decision with a residency consequence, and [RB-12](../runbooks/rb-12-region-failover.md) requires it to be communicated to tenants rather than treated as an internal operational detail.
