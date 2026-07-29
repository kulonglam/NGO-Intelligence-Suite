# Appendix A — Glossary

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Owner:** Chief Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20

Terms are grouped by domain. Where a word is used in this document with a narrower meaning than its everyday sense, the narrower meaning is authoritative and the difference is stated.

---

## A.1 Humanitarian and development terms

| Term | Definition |
| --- | --- |
| **Beneficiary** | A person or household receiving assistance from a programme. Used because it is the sector's term; note that many organisations prefer "participant" or "client", and the platform's UI labels are configurable per tenant for this reason |
| **Case management** | Structured tracking of an individual's or household's situation and the assistance provided over time |
| **Cluster** | A sector-based coordination group in a humanitarian response — health, WASH, protection, education. Not to be confused with a Kubernetes cluster |
| **Distribution** | An event at which assistance — cash, food, non-food items — is provided to beneficiaries |
| **Do no harm** | The principle that intervention must not increase risk to the people it intends to help. In this platform it is the governing principle for every data decision ([17 §17.2](../17-privacy-and-compliance.md)) |
| **DAC codes** | OECD Development Assistance Committee sector classification codes, used in donor reporting and IATI |
| **Donor** | An organisation funding a grant: institutional (USAID, FCDO, ECHO), multilateral (UN agencies), or private foundation |
| **FCDO** | Foreign, Commonwealth and Development Office — the UK government donor |
| **Grant** | A funding award from a donor to an implementing organisation, with a value, period, budget and reporting obligations |
| **IATI** | International Aid Transparency Initiative. A standard (v2.03 here) for publishing aid activity data openly. See [12 §12.4](../12-integration-architecture.md) |
| **Implementing partner** | An organisation delivering programme activities, sometimes under a sub-grant from another organisation |
| **Indicator** | A measurable value used to track programme progress against a target |
| **Logframe** | Logical framework. A matrix linking activities to outputs, outcomes and indicators |
| **M&E** | Monitoring and Evaluation. The function that tracks whether programmes are delivering what they intend |
| **NFI** | Non-food items — blankets, cooking sets, hygiene kits |
| **NGO** | Non-governmental organisation. The platform's tenant |
| **PSEA** | Protection from Sexual Exploitation and Abuse. A mandatory training and compliance area, tracked through the LMS |
| **Protection** | In humanitarian usage, activities aimed at ensuring the safety, dignity and rights of affected people. A **protection review** in this document asks what happens to a person if data is used exactly as designed, which is a different question from a security review ([34 §34.5](../34-future-extensibility.md)) |
| **Reach** | The number of people assisted, usually disaggregated by sex, age and disability |
| **Sub-grant** | A grant made by an implementing organisation to a smaller partner |
| **UNHCR** | United Nations High Commissioner for Refugees |
| **USAID** | United States Agency for International Development |
| **Vulnerability assessment** | A structured evaluation of a household's circumstances, producing a score used to prioritise assistance. In this platform it is deterministic, explainable and advisory ([Appendix I §I.2](i-algorithms.md)) |
| **WASH** | Water, Sanitation and Hygiene |

---

## A.2 Payroll and finance terms

| Term | Definition |
| --- | --- |
| **Cost centre** | An organisational unit against which costs are recorded, often mapping to a grant or project |
| **Effective-dated** | A record valid for a stated period, so that historical calculations use the rules in force at the time. All statutory rate data is effective-dated |
| **FX rate** | Foreign exchange rate. Stored with every transaction; never retrospectively re-applied ([32](../32-risk-register.md) R-45) |
| **Gross pay** | Total earnings before deductions |
| **ISO-4217** | The standard for currency codes. Every monetary value in the platform carries one ([30 FS-05](../30-quality-attributes-nfr.md)) |
| **LST** | Local Service Tax — a Uganda local government levy on employment income |
| **Maker-checker** | A control requiring that the person who prepares a transaction is not the person who approves it. Enforced at the database level for payroll and disbursements ([15 §15.5](../15-rbac-and-authorization.md)) |
| **Net pay** | Earnings after all deductions; the amount actually paid |
| **NSIF** | National Social Insurance Fund — South Sudan's social security scheme |
| **NSSF** | National Social Security Fund — Uganda's social security scheme |
| **PAYE** | Pay As You Earn. Income tax withheld by the employer from employee earnings |
| **Payroll run** | A single execution of the payroll calculation for a tenant and a period, producing records for each employee |
| **Proration** | Adjustment of pay for a partial period — a mid-month joiner or leaver |
| **Ruleset hash** | A hash pinning the exact statutory rules used by a payroll run, enabling reproducibility ([30 FS-02](../30-quality-attributes-nfr.md)) |
| **Statutory contribution** | An employer or employee payment required by law — social security, health insurance, training levies |
| **Tax band** | An income range with an associated marginal tax rate |
| **URA** | Uganda Revenue Authority |

---

## A.3 Platform and architecture terms

| Term | Definition |
| --- | --- |
| **Aggregate** | In domain-driven design, a cluster of entities treated as a single consistency unit with one root |
| **Anti-corruption layer** | A translation layer isolating our domain model from an external system's model ([12](../12-integration-architecture.md)) |
| **ADR** | Architecture Decision Record. A dated record of a decision, its alternatives and its consequences ([35 §35.5](../35-engineering-standards.md)) |
| **Bounded context** | A boundary within which a domain model and its terminology are consistent ([07](../07-domain-model-and-erd.md)) |
| **Blind index** | An HMAC of a normalised value, stored alongside encrypted data to permit exact-match lookup without decryption ([ADR-0015](../adr/0015-application-layer-pii-encryption.md)) |
| **C4 model** | A convention for architecture diagrams at four levels: Context, Container, Component, Code |
| **Canary deployment** | Releasing to a small share of traffic first, with automated analysis before proceeding ([22 §22.5](../22-cicd-release-supply-chain.md)) |
| **Causation ID** | The identifier of the event or request that directly caused this one |
| **Circuit breaker** | A pattern that stops calling a failing dependency for a period, failing fast instead |
| **Correlation ID** | An identifier propagated across every service, log line, trace and event arising from one originating request |
| **Consumer group** | In Redis Streams, a named set of consumers sharing a stream with per-message acknowledgement |
| **DLQ** | Dead-letter queue. Where an event goes after delivery attempts are exhausted ([RB-02](../runbooks/rb-02-dlq-drain-and-replay.md)) |
| **Envelope** | The standard wrapper around every event: ID, type, version, tenant, timestamps, correlation and causation IDs, payload ([11 §11.4](../11-event-driven-architecture.md)) |
| **Expand-contract** | A migration pattern: add the new structure, migrate, switch reads, then remove the old — so that every intermediate state is backward-compatible ([09 §9.4](../09-data-management-strategy.md)) |
| **Idempotent** | An operation that can be applied more than once with the same result as applying it once. Mandatory for every event consumer ([ADR-0011](../adr/0011-transactional-outbox.md)) |
| **Kill switch** | A feature flag whose purpose is to disable behaviour quickly during an incident ([20 §20.5.3](../20-configuration-secrets-feature-flags.md)) |
| **k-anonymity** | A property whereby any published record is indistinguishable from at least *k*−1 others. The platform enforces *k* = 5 on published aggregates ([30 PR-08](../30-quality-attributes-nfr.md)) |
| **Outbox** | A table written in the same transaction as a domain change, from which events are relayed — removing the dual-write problem ([ADR-0011](../adr/0011-transactional-outbox.md)) |
| **PgBouncer** | A PostgreSQL connection pooler. Used in transaction mode, which is why `SET LOCAL` matters ([09 §9.7](../09-data-management-strategy.md)) |
| **PWA** | Progressive Web App. An installable web application with offline capability ([ADR-0013](../adr/0013-pwa-over-native-mobile.md)) |
| **RLS** | Row-Level Security. PostgreSQL's per-row access policy mechanism, the primary tenant isolation control ([ADR-0002](../adr/0002-hybrid-multi-tenancy-with-rls.md)) |
| **Seam** | A place where the architecture will not obstruct a future change, as distinct from a built extension point ([ADR-0019](../adr/0019-narrow-extension-points.md)) |
| **Service tier** | Criticality classification, Tier 0 to Tier 3, determining SLO, degradation behaviour and paging ([06 §6.2](../06-microservice-design.md)) |
| **Tenant** | One NGO using the platform. The isolation unit for data, configuration, keys and quotas |
| **Tenant context** | The `app.current_tenant` session variable, set with `SET LOCAL` per transaction, on which RLS depends ([29 §29.3.3](../29-multi-tenancy-and-tenant-lifecycle.md)) |
| **Tombstoning** | Setting a personal data field to `NULL` while retaining the record, the mechanism for erasure ([17 §17.8](../17-privacy-and-compliance.md)) |

---

## A.4 Security, privacy and operations terms

| Term | Definition |
| --- | --- |
| **Break-glass** | Time-boxed emergency access, granted with recorded justification and session recording. There is no standing production access ([15 §15.6](../15-rbac-and-authorization.md)) |
| **Blast radius** | The scope of harm if a given credential, component or change fails |
| **CVE / CVSS** | Common Vulnerabilities and Exposures; the scoring system for their severity |
| **Data controller** | The party determining the purposes of processing. The **tenant** is the controller for their beneficiary and employee data |
| **Data processor** | The party processing on the controller's behalf. **We** are the processor |
| **DPIA** | Data Protection Impact Assessment ([17 §17.13](../17-privacy-and-compliance.md)) |
| **DPO** | Data Protection Officer. Holds an approval gate on any new personal data field |
| **Envelope encryption** | Encrypting data with a data key, and the data key with a key encryption key held in KMS |
| **Error budget** | The permitted amount of unreliability implied by an SLO; exhausting it halts feature work ([24 §24.8.2](../24-observability.md)) |
| **KMS** | Key Management Service. Holds key encryption keys; never exports them |
| **mTLS** | Mutual TLS, where both parties present certificates. Used for all internal service traffic |
| **MTTR** | Mean time to restore |
| **NOBYPASSRLS** | The PostgreSQL role attribute preventing a role from bypassing row-level security. Every service role has it ([30 SE-03](../30-quality-attributes-nfr.md)) |
| **PII** | Personally Identifiable Information |
| **PITR** | Point-in-time recovery ([RB-11](../runbooks/rb-11-backup-restore-drill.md)) |
| **Postmortem** | A blameless written analysis after an incident ([26 §26.6](../26-reliability-and-incident-management.md)) |
| **Purpose logging** | Recording who accessed which personal data, when, and why ([17 §17.6](../17-privacy-and-compliance.md)) |
| **RPO** | Recovery Point Objective. How much data loss is tolerable |
| **RTO** | Recovery Time Objective. How long restoration may take |
| **SBOM** | Software Bill of Materials. An inventory of components in a build ([22 §22.8](../22-cicd-release-supply-chain.md)) |
| **SEV-1 … SEV-4** | Incident severities. Cross-tenant access or PII exposure is automatically SEV-1 ([26 §26.2](../26-reliability-and-incident-management.md)) |
| **SLA / SLI / SLO** | Service Level Agreement, Indicator, Objective ([24 §24.8](../24-observability.md)) |
| **SLSA** | Supply-chain Levels for Software Artifacts. The platform targets Build Level 3 |
| **STRIDE** | A threat classification: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege ([16](../16-threat-model-stride.md)) |
| **Toil** | Manual, repetitive operational work that scales with load. Capped at 20 per cent of platform capacity ([35 §35.9.1](../35-engineering-standards.md)) |

---

## A.5 Terms used with a deliberately narrow meaning

Worth reading, because the everyday sense would be misleading.

| Term | Narrow meaning here |
| --- | --- |
| **Erasure** | Tombstoning of personal data fields plus deletion of associated files, verified, with the erasure recorded so it survives a restore. **Not** deletion of the record, which is retained de-identified for donor audit ([RB-07](../runbooks/rb-07-pii-erasure-request.md)) |
| **Deleted** (tenant) | Personal data removed; de-identified financial and programme records retained for the donor audit period, which may be seven years ([RB-06](../runbooks/rb-06-tenant-offboarding.md)) |
| **Suspended** (tenant) | **Read-only** by default, not locked out — because most suspensions are commercial and a locked-out tenant cannot file tomorrow's donor report. A *security* suspension removes access entirely ([29 §29.7.1](../29-multi-tenancy-and-tenant-lifecycle.md)) |
| **Verified** (backup) | Restored to a clone, structurally checked, row counts compared, **a sampled PII record successfully decrypted**, audit chain validated, and the erasure log replayed. An unrestored backup is not a backup ([RB-11 §5.6](../runbooks/rb-11-backup-restore-drill.md)) |
| **Available** (platform) | Non-5xx responses at the gateway. A slow-but-correct response counts as available; a fast 500 does not |
| **Conflict** (sync) | A concurrent change that the per-entity policy cannot resolve, routed to the tenant for a human decision. **Never** resolved by the platform ([ADR-0005](../adr/0005-offline-conflict-resolution-policy.md)) |
| **Draft** (AI output) | A persisted record that cannot become final without a named human approval, and is visually distinct until then ([ADR-0010](../adr/0010-llm-provider-and-boundaries.md)) |
| **Duplicate** (beneficiary) | A *probable* match, flagged for human review. Never merged automatically, because two records with the same name may be two people ([13 §13.6](../13-offline-first-architecture.md)) |
| **Done** (a story) | All fifteen conditions in [31 §31.8.1](../31-implementation-roadmap.md), of which "it works" is one |

---

## A.6 Abbreviations used in identifiers

| Prefix | Meaning | Example |
| --- | --- | --- |
| `ADR-` | Architecture Decision Record | ADR-0011 |
| `RB-` | Runbook | RB-16 |
| `R-` | Risk register entry | R-40 |
| `T-` | Threat model entry, numbered by trust boundary | T-5.1 |
| `TB-` | Trust boundary | TB-6 |
| `AIT-` | AI-specific threat, numbered independently of trust boundaries | AIT-4 |
| `TA-` | Threat actor profile | TA-3 |
| `AC-` | Abuse case | AC-6 |
| `S-` | Service Level Objective | S-6 |
| `D-` | Grafana dashboard | D-09 |
| `L-` | Load test scenario | L3 |
| `CH-` | Chaos experiment | CH-12 |
| `ASM-` | Design assumption | ASM-09 |
| `CON-` | Constraint | CON-01 |
| `NGOIS-` | Application error code | NGOIS-FLD-0031 |
| `FS-`, `PE-`, `CO-`, `US-`, `RE-`, `SE-`, `PR-`, `MA-`, `PO-`, `BC-` | Non-functional requirement categories | SE-16 |
