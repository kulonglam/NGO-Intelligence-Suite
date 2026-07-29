# NGO Intelligence Suite — Software Design Document

**Version 2.0** · Classification: Confidential — Internal Use Only

This directory is the authoritative Software Design Document (SDD) for the NGO Intelligence Suite. It supersedes the single-file SDD v1.0 dated 20 June 2026. Every architectural decision, schema definition, operational procedure and quality target for the platform is recorded here or in a document linked from here.

The document set is maintained as version-controlled Markdown. It is expected to change continuously as the system is built; a chapter that has not been reviewed within its stated review cadence is treated as untrusted and must be re-validated before it is used to justify an engineering decision.

---

## PDF export

A single book-structured PDF is generated from this Markdown set. The Markdown remains authoritative; regenerate rather than editing the PDF by hand ([tools/pdf/](tools/pdf/README.md)).

| Artefact | Path |
| --- | --- |
| SDD v2.0 (single PDF) | [pdf/NGOIS-SDD-v2.0.pdf](pdf/NGOIS-SDD-v2.0.pdf) |

```powershell
cd docs/sdd/tools/pdf
npm install
node build.mjs
```

---

## How to use this document

The SDD is long by design. Nobody is expected to read it front to back. Use the reading paths below to get to the parts that matter for what you are doing.

| If you are… | Read, in this order |
| --- | --- |
| A new engineer joining the team | [01](01-executive-summary.md), [03](03-system-overview-and-context.md), [04](04-architecture-principles.md), [05](05-architecture-diagrams.md), [06](06-microservice-design.md), [35](35-engineering-standards.md) |
| Implementing a new API endpoint | [10](10-api-design-standards.md), [15](15-rbac-and-authorization.md), [08](08-database-schema.md), [23](23-testing-strategy.md), [24](24-observability.md) |
| Implementing an async workflow | [11](11-event-driven-architecture.md), [Appendix D](appendices/d-event-catalog.md), [06](06-microservice-design.md) |
| Working on the field mobile app | [13](13-offline-first-architecture.md), [19](19-frontend-architecture.md), [12](12-integration-architecture.md) |
| Reviewing security posture | [14](14-security-architecture.md), [15](15-rbac-and-authorization.md), [16](16-threat-model-stride.md), [17](17-privacy-and-compliance.md) |
| On call this week | [24](24-observability.md), [26](26-reliability-and-incident-management.md), [28](28-operational-runbooks.md), [27](27-disaster-recovery-and-bcp.md) |
| Preparing a donor or audit response | [17](17-privacy-and-compliance.md), [Appendix H](appendices/h-compliance-traceability.md), [14](14-security-architecture.md), [27](27-disaster-recovery-and-bcp.md) |
| Planning delivery or budget | [31](31-implementation-roadmap.md), [32](32-risk-register.md), [33](33-cost-model-and-finops.md), [30](30-quality-attributes-nfr.md) |
| Deciding whether to change the architecture | [04](04-architecture-principles.md), [adr/](adr/), [Appendix F](appendices/f-adr-index.md), [35](35-engineering-standards.md) |

---

## Table of contents

### Front matter

| # | Chapter | Summary |
| --- | --- | --- |
| — | [Document Control](00-front-matter.md) | Ownership, approvals, distribution, revision history, document conventions |

### Part I — Context

| # | Chapter | Summary |
| --- | --- | --- |
| 01 | [Executive Summary](01-executive-summary.md) | The problem, the solution, the architecture on one page, cost, timeline, top risks |
| 02 | [Introduction](02-introduction.md) | Purpose, scope boundaries, audience, definitions, references, document conventions |
| 03 | [System Overview and Context](03-system-overview-and-context.md) | Product vision, stakeholders and RACI, C4 system context, external system inventory |
| 04 | [Architecture Principles, Assumptions and Constraints](04-architecture-principles.md) | Twelve binding principles, assumption register, constraints, trade-off log |

### Part II — Architecture

| # | Chapter | Summary |
| --- | --- | --- |
| 05 | [Architecture Diagrams](05-architecture-diagrams.md) | C4 container view, service interaction and dependency graphs, security zones, Kubernetes topology, pod internals, six data-flow diagrams |
| 06 | [Microservice Design](06-microservice-design.md) | Service inventory with ownership and SLO tiers; per-service specifications, failure modes and degradation behaviour |
| 07 | [Domain Model and ERD](07-domain-model-and-erd.md) | Bounded-context map, ubiquitous language, entity-relationship diagrams, cross-domain integration patterns |
| 08 | [Database Schema](08-database-schema.md) | Complete DDL for all tables, enums, constraints, triggers and row-level security policies |
| 09 | [Data Management Strategy](09-data-management-strategy.md) | Indexing, partitioning, migrations, seeding, archival, retention, connection pooling, Redis caching |

### Part III — Interfaces

| # | Chapter | Summary |
| --- | --- | --- |
| 10 | [API Design Standards](10-api-design-standards.md) | Envelope, status codes, versioning and deprecation, idempotency, concurrency control, pagination, filtering, rate limits, error taxonomy |
| 11 | [Event-Driven Architecture](11-event-driven-architecture.md) | Topology, event envelope, publisher/subscriber matrix, retry and DLQ, idempotency, versioning, outbox pattern |
| 12 | [Integration Architecture](12-integration-architecture.md) | External connectors, anti-corruption layers, IATI publishing, mobile money, messaging providers, resilience policies |
| 13 | [Offline-First and Field Operations Architecture](13-offline-first-architecture.md) | PWA shell, IndexedDB, sync protocol, conflict resolution, low-bandwidth optimisation, device management, SMS fallback |

### Part IV — Security and Compliance

| # | Chapter | Summary |
| --- | --- | --- |
| 14 | [Security Architecture](14-security-architecture.md) | Authentication flows, token lifecycle, key management, service mesh, network controls, application security, audit logging |
| 15 | [RBAC and Authorization Matrix](15-rbac-and-authorization.md) | Permission model, full role-by-operation matrix, field and record-level rules, separation of duties, break-glass |
| 16 | [Threat Model (STRIDE)](16-threat-model-stride.md) | Asset register, threat actors, trust boundaries, STRIDE enumeration with scoring, mitigations, residual risk |
| 17 | [Privacy, Data Protection and Humanitarian Compliance](17-privacy-and-compliance.md) | Data classification, PII inventory, DPIA, data subject rights, do-no-harm principles, residency, compliance mapping |
| 18 | [AI and LLM Architecture and Governance](18-ai-llm-architecture.md) | LLM use cases, redaction pipeline, human-in-the-loop gates, guardrails, evaluation, cost controls, AI-specific threats |

### Part V — Delivery and Operations

| # | Chapter | Summary |
| --- | --- | --- |
| 19 | [Frontend Architecture](19-frontend-architecture.md) | Vue 3 application structure, state management, design system, internationalisation with RTL, accessibility, performance budgets |
| 20 | [Configuration, Secrets and Feature Flags](20-configuration-secrets-feature-flags.md) | Configuration hierarchy, boot-time validation, secret storage and rotation, flag taxonomy and lifecycle |
| 21 | [Deployment and Infrastructure](21-deployment-and-infrastructure.md) | Cluster topology, namespaces, workload specifications, network policies, infrastructure as code, environments |
| 22 | [CI/CD, Release Management and Supply Chain Security](22-cicd-release-supply-chain.md) | Pipeline stages, branching, versioning, progressive delivery, migration gating, SBOM, artifact signing, patch SLAs |
| 23 | [Testing Strategy](23-testing-strategy.md) | Test pyramid, every test type from unit to chaos, tenant isolation testing, test data strategy, coverage gates |
| 24 | [Observability](24-observability.md) | Metrics registry, logging schema, distributed tracing, probes, dashboards, alert catalog, SLIs, SLOs and error budgets |
| 25 | [Performance, Scalability and Capacity Planning](25-performance-and-capacity.md) | Performance budgets, query standards, load model, growth projections, bottleneck analysis, scaling limits |
| 26 | [Reliability, Incident Management and On-Call](26-reliability-and-incident-management.md) | Severity matrix, on-call model, escalation, incident command, communications, postmortems, error budget policy |
| 27 | [Disaster Recovery and Business Continuity](27-disaster-recovery-and-bcp.md) | RPO/RTO tiers, backup strategy, multi-region failover, database and cluster recovery, DR testing, business continuity |
| 28 | [Operational Runbooks](28-operational-runbooks.md) | Runbook standards and the indexed set of executable operational procedures |
| 29 | [Multi-Tenancy and Tenant Lifecycle](29-multi-tenancy-and-tenant-lifecycle.md) | Isolation model, RLS patterns and bypass risks, quotas, provisioning, export, offboarding and deletion |

### Part VI — Planning and Governance

| # | Chapter | Summary |
| --- | --- | --- |
| 30 | [Quality Attributes and Non-Functional Requirements](30-quality-attributes-nfr.md) | ISO/IEC 25010-aligned requirements with measurable acceptance criteria and verification methods |
| 31 | [Implementation Roadmap](31-implementation-roadmap.md) | Four delivery phases, cross-cutting workstreams, team topology, critical path, release readiness |
| 32 | [Risk Register](32-risk-register.md) | Technical, security, operational, delivery and contextual risks with scoring, mitigation and ownership |
| 33 | [Cost Model and FinOps](33-cost-model-and-finops.md) | Infrastructure and licence costs, cost per tenant, LLM token economics, optimisation levers, budget controls |
| 34 | [Future Extensibility](34-future-extensibility.md) | Designed extension points, plugin and webhook model, new-country onboarding, post-Phase-4 horizon |
| 35 | [Engineering Standards and Ways of Working](35-engineering-standards.md) | Code ownership, review standards, ADR process, API design review, definition of done, tech radar |

### Appendices

| Ref | Appendix | Summary |
| --- | --- | --- |
| A | [Glossary](appendices/a-glossary.md) | Domain, humanitarian, technical and regulatory terminology |
| B | [Data Dictionary](appendices/b-data-dictionary.md) | Every column in every table with type, constraints, classification and provenance |
| C | [RBAC Permission Matrix](appendices/c-rbac-matrix.md) | The complete machine-readable role-by-permission matrix |
| D | [Event Catalog](appendices/d-event-catalog.md) | Every domain event with schema, producers, consumers and delivery semantics |
| E | [Error Code Registry](appendices/e-error-codes.md) | Every application error code with HTTP status, message and remediation |
| F | [ADR Index](appendices/f-adr-index.md) | All architecture decision records with status and supersession chain |
| G | [Runbook Index](appendices/g-runbook-index.md) | All operational runbooks with trigger conditions and severity mapping |
| H | [Compliance Traceability Matrix](appendices/h-compliance-traceability.md) | Control requirements mapped to implementing sections and evidence |
| I | [Algorithms](appendices/i-algorithms.md) | Vulnerability scoring, burn rate, compliance score, PAYE/NSIF, deduplication, with worked examples |

### Architecture Decision Records

Twenty records covering the load-bearing decisions, all currently Accepted. [Appendix F](appendices/f-adr-index.md) groups them by concern and records which are most consequential; the full text of each is below.

| ADR | Decision | Chapters |
| --- | --- | --- |
| [0001](adr/0001-microservices-over-modular-monolith.md) | Domain-aligned microservices over a modular monolith | [06](06-microservice-design.md) |
| [0002](adr/0002-hybrid-multi-tenancy-with-rls.md) | Hybrid multi-tenancy: shared schema with row-level security | [29](29-multi-tenancy-and-tenant-lifecycle.md) |
| [0003](adr/0003-redis-streams-over-kafka.md) | Redis Streams as the event substrate, not Kafka | [11](11-event-driven-architecture.md) |
| [0004](adr/0004-supabase-auth-as-identity-provider.md) | Supabase Auth as the identity provider | [14](14-security-architecture.md) |
| [0005](adr/0005-offline-conflict-resolution-policy.md) | Per-entity offline conflict resolution, not last-write-wins | [13](13-offline-first-architecture.md) |
| [0006](adr/0006-per-tenant-schema-for-payroll.md) | Per-tenant PostgreSQL schemas for payroll data | [08](08-database-schema.md), [29](29-multi-tenancy-and-tenant-lifecycle.md) |
| [0007](adr/0007-typescript-on-node20.md) | TypeScript on Node.js 20 LTS across all services | [35](35-engineering-standards.md) |
| [0008](adr/0008-sync-vs-async-boundaries.md) | Synchronous only when the user is waiting | [06](06-microservice-design.md), [11](11-event-driven-architecture.md) |
| [0009](adr/0009-uri-path-api-versioning.md) | Major API version in the URI path | [10](10-api-design-standards.md) |
| [0010](adr/0010-llm-provider-and-boundaries.md) | Anthropic Claude as LLM provider, with hard boundaries | [18](18-ai-llm-architecture.md) |
| [0011](adr/0011-transactional-outbox.md) | Transactional outbox for event publication | [11](11-event-driven-architecture.md) |
| [0012](adr/0012-custom-gateway-over-kong.md) | A custom Express API gateway rather than Kong | [06](06-microservice-design.md), [14](14-security-architecture.md) |
| [0013](adr/0013-pwa-over-native-mobile.md) | A progressive web app rather than native mobile applications | [13](13-offline-first-architecture.md), [19](19-frontend-architecture.md) |
| [0014](adr/0014-gke-and-region-selection.md) | Google Cloud, GKE Standard, and `africa-south1` as primary region | [21](21-deployment-and-infrastructure.md) |
| [0015](adr/0015-application-layer-pii-encryption.md) | Application-layer PII encryption with per-tenant keys | [14](14-security-architecture.md), [17](17-privacy-and-compliance.md) |
| [0016](adr/0016-single-region-with-warm-dr.md) | Single primary region with warm standby, not active-active | [27](27-disaster-recovery-and-bcp.md) |
| [0017](adr/0017-self-hosted-observability-stack.md) | Self-hosted Prometheus, Grafana, Loki and Tempo | [24](24-observability.md) |
| [0018](adr/0018-trunk-based-development.md) | Trunk-based development with release flags | [20](20-configuration-secrets-feature-flags.md), [22](22-cicd-release-supply-chain.md) |
| [0019](adr/0019-narrow-extension-points.md) | Build an extension point only on the second concrete case | [34](34-future-extensibility.md) |
| [0020](adr/0020-vue-3-frontend-stack.md) | Vue 3 with Pinia, TanStack Query and Tailwind | [19](19-frontend-architecture.md) |

### Runbooks

Sixteen executable operational procedures, written to be followed by an engineer with no prior context at 02:00. [Appendix G](appendices/g-runbook-index.md) maps every alert to exactly one of them and records each one's verification date.

| RB | Procedure | Severity |
| --- | --- | --- |
| [RB-01](runbooks/rb-01-failed-payroll-run.md) | Failed or stalled payroll run | SEV-2, SEV-1 near a statutory deadline |
| [RB-02](runbooks/rb-02-dlq-drain-and-replay.md) | Dead letter queue drain and event replay | SEV-2 |
| [RB-03](runbooks/rb-03-database-failover.md) | Database failover and recovery | SEV-1 |
| [RB-04](runbooks/rb-04-certificate-rotation.md) | Certificate rotation and expiry recovery | SEV-3, SEV-1 once expired |
| [RB-05](runbooks/rb-05-tenant-onboarding.md) | Tenant provisioning | Not an incident |
| [RB-06](runbooks/rb-06-tenant-offboarding.md) | Tenant offboarding and data deletion | Not an incident |
| [RB-07](runbooks/rb-07-pii-erasure-request.md) | Personal data erasure request | Not an incident, 30-day SLA |
| [RB-08](runbooks/rb-08-scale-event.md) | Capacity and saturation response | SEV-2 or SEV-3 |
| [RB-09](runbooks/rb-09-secret-rotation.md) | Secret rotation, planned and emergency | SEV-1 when compromised |
| [RB-10](runbooks/rb-10-hotfix-deployment.md) | Hotfix deployment | Follows the incident it addresses |
| [RB-11](runbooks/rb-11-backup-restore-drill.md) | Backup restore and point-in-time recovery | SEV-1 for real data loss |
| [RB-12](runbooks/rb-12-region-failover.md) | Regional failover | SEV-1 |
| [RB-13](runbooks/rb-13-service-down.md) | Service unavailable or crash looping | SEV-1 for Tier 1, SEV-2 otherwise |
| [RB-14](runbooks/rb-14-security-incident.md) | Security incident and suspected data exposure | SEV-1 always |
| [RB-15](runbooks/rb-15-integration-failure.md) | External integration failure | SEV-3, SEV-2 for FX staleness |
| [RB-16](runbooks/rb-16-sync-failure.md) | Field sync failure | SEV-2, escalating to SEV-1 after 6 h |

---

## Document conventions

Each chapter opens with a control block stating the owner, status, last review date and related ADRs. The following statuses are used:

| Status | Meaning |
| --- | --- |
| `Draft` | Under active authoring; not yet a basis for implementation |
| `In Review` | Content complete, awaiting architecture review board sign-off |
| `Approved` | Signed off; changes require an ADR or a documented review |
| `Superseded` | Replaced by another chapter or ADR, retained for history |

Requirement language follows RFC 2119: **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** carry their normative meanings. A statement written with **MUST** is a gate — code that violates it does not merge.

Identifiers are cited in their canonical form throughout: services as `grant-service`, roles as `finance_manager`, events as `grant.disbursement.recorded`, permissions as `grant:disbursement:create`, tables as `grants`, and configuration keys as `GRANT_SERVICE_DB_URL`. Where v1.0 of this document used a different form, the v2.0 form is authoritative and the change is noted in [00-front-matter.md](00-front-matter.md).

---

## Maintaining this document

The SDD is owned by the Architecture Guild and maintained under the same review rules as production code. Changes follow the process in [35-engineering-standards.md](35-engineering-standards.md):

1. A change that alters a load-bearing decision requires an ADR before the chapter is edited.
2. A change to a chapter requires review by that chapter's named owner.
3. A change to schema, events, API contracts or the RBAC matrix additionally requires review by the Architecture Guild, because those are cross-service contracts.
4. Every merged change updates the `Last Reviewed` date in the chapter control block and adds a row to the revision history in [00-front-matter.md](00-front-matter.md).

Chapters have a review cadence stated in their control block. Security, privacy and threat-model chapters are reviewed quarterly regardless of whether the system changed; everything else is reviewed at each phase boundary.

### Automated consistency checks

Cross-reference rot is invisible when you read one chapter at a time, so it is checked by script instead. [tools/](tools/README.md) holds the checks, and they run on every change under `docs/sdd/`:

```powershell
powershell -ExecutionPolicy Bypass -File docs/sdd/tools/check-all.ps1
```

They verify referential integrity, not truth. A passing run means every link resolves, every identifier is defined before use, every diagram parses, and service names, ports and metric names agree across chapters. It does not mean any chapter describes the system correctly — [tools/README.md](tools/README.md) is explicit about what the checks cannot see.
