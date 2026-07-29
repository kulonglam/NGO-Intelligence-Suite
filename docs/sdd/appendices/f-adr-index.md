# Appendix F — Architecture Decision Record Index

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Owner:** Chief Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Process:** [35 §35.5](../35-engineering-standards.md)

---

## F.1 The index

Twenty records. All Accepted; none superseded to date.

| ADR | Decision | Date | Status | Primary chapters |
| --- | --- | --- | --- | --- |
| [0001](../adr/0001-microservices-over-modular-monolith.md) | Domain-aligned microservices over a modular monolith | 2026-04-08 | Accepted | [06](../06-microservice-design.md) |
| [0002](../adr/0002-hybrid-multi-tenancy-with-rls.md) | Hybrid multi-tenancy: shared schema with row-level security | 2026-04-10 | Accepted | [29](../29-multi-tenancy-and-tenant-lifecycle.md), [08](../08-database-schema.md) |
| [0003](../adr/0003-redis-streams-over-kafka.md) | Redis Streams as the event substrate, not Kafka | 2026-04-14 | Accepted | [11](../11-event-driven-architecture.md) |
| [0004](../adr/0004-supabase-auth-as-identity-provider.md) | Supabase Auth as the identity provider | 2026-04-16 | Accepted | [14](../14-security-architecture.md) |
| [0005](../adr/0005-offline-conflict-resolution-policy.md) | Per-entity offline conflict resolution, not last-write-wins | 2026-04-22 | Accepted | [13](../13-offline-first-architecture.md) |
| [0006](../adr/0006-per-tenant-schema-for-payroll.md) | Per-tenant PostgreSQL schemas for payroll data | 2026-04-24 | Accepted | [29 §29.4](../29-multi-tenancy-and-tenant-lifecycle.md) |
| [0007](../adr/0007-typescript-on-node20.md) | TypeScript on Node.js 20 LTS across all services | 2026-04-08 | Accepted | [06](../06-microservice-design.md), [35](../35-engineering-standards.md) |
| [0008](../adr/0008-sync-vs-async-boundaries.md) | Synchronous only when the user is waiting | 2026-04-14 | Accepted | [11](../11-event-driven-architecture.md) |
| [0009](../adr/0009-uri-path-api-versioning.md) | Major API version in the URI path | 2026-04-28 | Accepted | [10 §10.11](../10-api-design-standards.md) |
| [0010](../adr/0010-llm-provider-and-boundaries.md) | Anthropic Claude as LLM provider, with hard boundaries | 2026-05-30 | Accepted | [18](../18-ai-llm-architecture.md) |
| [0011](../adr/0011-transactional-outbox.md) | Transactional outbox for event publication | 2026-04-18 | Accepted | [11](../11-event-driven-architecture.md) |
| [0012](../adr/0012-custom-gateway-over-kong.md) | A custom Express API gateway rather than Kong | 2026-04-26 | Accepted | [06 §6.3](../06-microservice-design.md) |
| [0013](../adr/0013-pwa-over-native-mobile.md) | A Progressive Web App rather than native mobile applications | 2026-04-20 | Accepted | [13](../13-offline-first-architecture.md), [19](../19-frontend-architecture.md) |
| [0014](../adr/0014-gke-and-region-selection.md) | Google Cloud, GKE Standard, `africa-south1` as primary | 2026-05-06 | Accepted | [21](../21-deployment-and-infrastructure.md) |
| [0015](../adr/0015-application-layer-pii-encryption.md) | Application-layer PII encryption with per-tenant keys | 2026-05-12 | Accepted | [14 §14.4](../14-security-architecture.md), [17](../17-privacy-and-compliance.md) |
| [0016](../adr/0016-single-region-with-warm-dr.md) | Single primary region with warm standby, not active-active | 2026-05-18 | Accepted | [27](../27-disaster-recovery-and-bcp.md) |
| [0017](../adr/0017-self-hosted-observability-stack.md) | Self-hosted Prometheus, Grafana, Loki and Tempo | 2026-05-22 | Accepted | [24](../24-observability.md) |
| [0018](../adr/0018-trunk-based-development.md) | Trunk-based development with release flags | 2026-05-04 | Accepted | [22](../22-cicd-release-supply-chain.md) |
| [0019](../adr/0019-narrow-extension-points.md) | Build an extension point only on the second concrete case | 2026-06-10 | Accepted | [34](../34-future-extensibility.md) |
| [0020](../adr/0020-vue-3-frontend-stack.md) | Vue 3 with Pinia, TanStack Query and Tailwind | 2026-04-20 | Accepted | [19](../19-frontend-architecture.md) |

---

## F.2 Grouped by concern

| Concern | ADRs |
| --- | --- |
| **Decomposition and communication** | 0001, 0008, 0011, 0012 |
| **Multi-tenancy and isolation** | 0002, 0006, 0015 |
| **Data and events** | 0003, 0011 |
| **Identity and security** | 0004, 0015 |
| **Field and offline** | 0005, 0013 |
| **Interfaces** | 0009, 0012 |
| **Platform and runtime** | 0007, 0014, 0016, 0017, 0020 |
| **Delivery** | 0018 |
| **AI** | 0010 |
| **Evolution** | 0019 |

---

## F.3 The load-bearing decisions

If a reader has time for four ADRs, these are the ones the rest of the architecture rests on.

| ADR | Why it carries the most weight |
| --- | --- |
| **[0002](../adr/0002-hybrid-multi-tenancy-with-rls.md)** — RLS multi-tenancy | Determines the shape of every table, every index, every query and every test. A different choice here would change most of the document |
| **[0015](../adr/0015-application-layer-pii-encryption.md)** — per-tenant PII encryption | The last barrier if every other isolation control fails. It also costs real product capability, which makes it the most consequential trade-off recorded |
| **[0011](../adr/0011-transactional-outbox.md)** — transactional outbox | Makes the asynchronous architecture trustworthy. Without it, [0003](../adr/0003-redis-streams-over-kafka.md) would not be defensible |
| **[0001](../adr/0001-microservices-over-modular-monolith.md)** — microservices | The decision with the highest ongoing cost, and the only one carrying an explicit tripwire for reversal |

---

## F.4 Decisions revisited on a schedule

Four decisions have a stated reassessment condition rather than being settled indefinitely. Recording them here means the review happens because it is scheduled, not because something broke.

| ADR | Reassess when | Cadence |
| --- | --- | --- |
| [0001](../adr/0001-microservices-over-modular-monolith.md) | Any two tripwire conditions hold for two consecutive quarters — change failure rate, lead time, coordinated deployments, on-call load | Quarterly against the metrics |
| [0010](../adr/0010-llm-provider-and-boundaries.md) | Self-hosted inference becomes affordable, or a tenant requires no third-party processing | Annually |
| [0016](../adr/0016-single-region-with-warm-dr.md) | A tenant requires an RTO under an hour, or a real regional failure shows the tolerance was mis-estimated | After any invocation; otherwise annually |
| [0017](../adr/0017-self-hosted-observability-stack.md) | Observability maintenance exceeds ~5 per cent of platform capacity, or the commercial cost ratio inverts with growth | Annually |

Two further decisions have a documented escape hatch rather than a review date: [0002](../adr/0002-hybrid-multi-tenancy-with-rls.md) accommodates a dedicated-database tenant as a special case, and [0014](../adr/0014-gke-and-region-selection.md) retains GKE Autopilot as a fallback.

---

## F.5 Decisions where the reasoning is closest

Worth flagging, because these are the ones a future reader is most likely to reverse — and the ADRs record why they went the way they did rather than presenting them as obvious.

| ADR | The alternative that nearly won |
| --- | --- |
| [0001](../adr/0001-microservices-over-modular-monolith.md) | A modular monolith. Genuinely attractive; rejected on payroll isolation, three-squad release coupling, and divergent scaling profiles |
| [0014](../adr/0014-gke-and-region-selection.md) | AWS `af-south1`. A narrow margin on managed-database operational ergonomics and non-profit pricing |
| [0010](../adr/0010-llm-provider-and-boundaries.md) | No LLM at all, and separately a self-hosted open-weight model |
| [0013](../adr/0013-pwa-over-native-mobile.md) | A Capacitor wrapper, which remains the first option if device seizure risk materialises |
| [0017](../adr/0017-self-hosted-observability-stack.md) | Grafana Cloud, adopted for synthetic monitoring only |
| [0003](../adr/0003-redis-streams-over-kafka.md) | Google Pub/Sub, rejected mainly on incident ergonomics and local testability |

---

## F.6 Format and lifecycle

Every record has: Context, Decision, Alternatives Considered, Consequences, Status.

Two sections carry the value, and both are enforced in review:

**Alternatives Considered must say why each was rejected, specifically.** "We considered Kafka but chose Redis Streams" is worthless. Naming the operational burden against a five-person platform capability at our throughput is what a future reader needs.

**Consequences must include the negative ones.** An ADR listing only benefits is marketing, and it will not help whoever discovers the downside the hard way.

Status moves `Proposed → Accepted → Superseded` or `Deprecated`. **A record is never edited after acceptance and never deleted.** A superseded decision is superseded by a new record that references it, because the point is the history of what was believed and why.
