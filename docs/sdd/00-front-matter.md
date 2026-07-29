# Document Control

> **Document:** NGO Intelligence Suite — Software Design Document
> **Version:** 2.0
> **Status:** Approved
> **Classification:** Confidential — Internal Use Only
> **Owner:** Kulong Lam Wuol Nyar, Principal Architect
> **Last Reviewed:** 2026-06-20
> **Review Cadence:** At each phase boundary; security chapters quarterly

---

## 1. Identification

| Field | Value |
| --- | --- |
| Document title | NGO Intelligence Suite — Software Design Document |
| Document identifier | NGOIS-SDD |
| Version | 2.0 |
| Supersedes | NGOIS-SDD v1.0 (20 June 2026) |
| Author | Kulong Lam Wuol Nyar |
| Classification | Confidential — Internal Use Only |
| Retention | Life of product plus seven years |
| Storage of record | Git repository `ngo-intelligence-suite`, path `docs/sdd/` |

This document contains architectural detail, security control descriptions and threat analysis. It **MUST NOT** be shared outside the organisation without written approval from the Executive Director and the Security Lead. A redacted variant suitable for donor due-diligence packs is maintained separately and is derived from [17-privacy-and-compliance.md](17-privacy-and-compliance.md) and [Appendix H](appendices/h-compliance-traceability.md).

---

## 2. Ownership and accountability

Every chapter has a named owner who is accountable for its accuracy. Ownership is a role, not a person; when the role changes hands the control blocks are updated in a single housekeeping commit.

| Role | Accountable for | Chapters owned |
| --- | --- | --- |
| Principal Architect | Overall coherence, architecture decisions | 00, 01–07, 34, 35, Appendix A, Appendix F, `adr/` |
| Data Architect | Schema, data lifecycle, migrations | 08, 09, Appendix B |
| API Lead | Interface contracts, versioning | 10, 11, 12, Appendix D, Appendix E |
| Mobile / Frontend Lead | Client applications, offline behaviour | 13, 19 |
| Security Lead | Security controls, threat model, RBAC | 14, 15, 16, Appendix C |
| Data Protection Officer | Privacy, humanitarian data protection, compliance | 17, Appendix H |
| AI Lead | LLM integration and governance | 18 |
| Platform Lead | Infrastructure, CI/CD, configuration | 20, 21, 22, 29, `tools/` |
| Quality Lead | Testing strategy, quality gates | 23, 30 |
| SRE Lead | Observability, reliability, capacity, DR | 24, 25, 26, 27, 28, Appendix G, `runbooks/` |
| Delivery Manager | Roadmap, risk, cost | 31, 32, 33 |

Architectural authority sits with the Architecture Guild — the Principal Architect plus the leads listed above. The Guild meets fortnightly and is the only body that can approve an ADR.

[Appendix I](appendices/i-algorithms.md) is the one document with shared ownership, because its seven algorithms belong to different domains: vulnerability scoring and k-anonymity suppression to the Data Protection Officer, payroll calculation to the Data Architect with the Finance Manager as business owner, burn rate and error budget to the SRE Lead, and deduplication to the Security Lead. The Principal Architect owns the appendix as a document and is responsible for it remaining internally consistent, but **MUST NOT** approve a change to a worked example without the relevant domain owner. Splitting one appendix into four would be tidier on paper and would guarantee that the shared conventions drift apart.

---

## 3. Approval record

Version 2.0 was approved on the dates below. An approval attests that the approver has read the chapters in their domain and accepts them as the basis for implementation.

| Approver | Role | Scope of approval | Date |
| --- | --- | --- | --- |
| Kulong Lam Wuol Nyar | Principal Architect | Whole document | 2026-06-20 |
| Executive Director | Sponsor | Parts I and VI; budget and roadmap | 2026-06-20 |
| Security Lead | Security | Part IV | 2026-06-20 |
| Data Protection Officer | Privacy | Chapter 17, Appendix H | 2026-06-20 |
| Finance Manager | Business owner, grants and payroll | Chapters 06, 08, 15 as they affect financial controls | 2026-06-20 |
| SRE Lead | Operations | Part V | 2026-06-20 |

An unapproved chapter carries `Status: Draft` or `Status: In Review` in its control block and **MUST NOT** be used to justify an implementation choice in code review.

---

## 4. Distribution list

| Audience | Access | Delivery |
| --- | --- | --- |
| Engineering team (all) | Read/write via pull request | Git repository |
| Architecture Guild | Approve | Git repository |
| Executive Director, Finance Manager, HR Manager | Read | Exported PDF, quarterly |
| External security auditor | Read, time-boxed | Signed access grant, chapters 14–17 and Appendix H only |
| Donor due-diligence reviewers | Read, redacted | Derived compliance pack, not this document |
| Prospective engineering hires | No access | — |

---

## 5. Revision history

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 0.1 | 2026-05 | Kulong Lam Wuol Nyar | Initial draft — architecture and ERD sections |
| 1.0 | 2026-06-20 | Kulong Lam Wuol Nyar | First approved release. Twelve sections covering introduction, system overview, architecture, microservice design, ERD, schema, API standards, security, deployment, roadmap, quality attributes and appendices |
| 2.0 | 2026-06-20 | Kulong Lam Wuol Nyar | Enterprise expansion. Restructured from a single document into a maintained set of 36 chapters across six parts, plus nine appendices, twenty ADRs and sixteen runbooks. All v1.0 content retained and expanded. New material summarised in section 6 below |

---

## 6. What changed in version 2.0

Version 1.0 described the system well enough to start building it. It did not describe how the system would be tested, operated, secured against a determined adversary, recovered after a disaster, or governed as it grows. Version 2.0 closes those gaps and brings the document to the standard expected of an enterprise SaaS platform.

### 6.1 New chapters

| Chapter | Why it was added |
| --- | --- |
| [04](04-architecture-principles.md) Architecture Principles | v1.0 stated decisions without stating the reasoning that would let a future engineer decide a case the document does not cover |
| [05](05-architecture-diagrams.md) Architecture Diagrams | v1.0 described the architecture in prose and tables only; there were no diagrams at all |
| [09](09-data-management-strategy.md) Data Management Strategy | Indexing, partitioning, migrations and caching were unspecified, which is the most common source of production incidents in systems of this shape |
| [11](11-event-driven-architecture.md) Event-Driven Architecture | v1.0 mentioned Redis Streams and named two events; there was no catalog, no retry policy, no dead-letter design and no idempotency rule |
| [12](12-integration-architecture.md) Integration Architecture | External integrations were listed but their failure behaviour, which is the hard part, was not designed |
| [13](13-offline-first-architecture.md) Offline-First Architecture | Offline capability was a one-line non-functional requirement despite being the platform's hardest technical problem |
| [15](15-rbac-and-authorization.md) RBAC and Authorization Matrix | v1.0 listed seven role names; it did not say what any of them could do |
| [16](16-threat-model-stride.md) Threat Model | No structured threat analysis existed |
| [17](17-privacy-and-compliance.md) Privacy and Humanitarian Compliance | GDPR Article 17 was mentioned in passing; the obligations around beneficiary data in a conflict setting go far beyond that |
| [18](18-ai-llm-architecture.md) AI and LLM Governance | v1.0 proposed sending data to a third-party LLM without specifying redaction, review gates or cost controls |
| [19](19-frontend-architecture.md) Frontend Architecture | The client tier was one row in a table |
| [20](20-configuration-secrets-feature-flags.md) Configuration, Secrets and Feature Flags | Progressive delivery is impossible without a flag model |
| [22](22-cicd-release-supply-chain.md) CI/CD and Supply Chain Security | v1.0 had a pipeline listing but no branching model, rollback plan, migration gating or supply-chain controls |
| [23](23-testing-strategy.md) Testing Strategy | v1.0 specified a coverage number and nothing else |
| [24](24-observability.md) Observability | v1.0 named Prometheus and Grafana but defined no metrics, logs, traces, SLOs or alerts |
| [25](25-performance-and-capacity.md) Performance and Capacity Planning | Targets existed with no model showing they were achievable |
| [26](26-reliability-and-incident-management.md) Incident Management | No severity model, escalation path or postmortem process |
| [27](27-disaster-recovery-and-bcp.md) Disaster Recovery | RPO and RTO were stated as numbers with no procedure behind them |
| [28](28-operational-runbooks.md) Operational Runbooks | None existed |
| [29](29-multi-tenancy-and-tenant-lifecycle.md) Multi-Tenancy and Tenant Lifecycle | The isolation model was described in three bullets; tenant onboarding, export and deletion were undefined |
| [32](32-risk-register.md) Risk Register | No risks were recorded |
| [33](33-cost-model-and-finops.md) Cost Model | No cost model existed for a platform serving budget-constrained organisations |
| [34](34-future-extensibility.md) Future Extensibility | Extension points were not identified, so they would not have been designed for |
| [35](35-engineering-standards.md) Engineering Standards | How the team works was undocumented |

### 6.2 Expanded chapters

Chapters 01, 02, 03, 06, 07, 08, 10, 14, 21, 30 and 31 all retain their v1.0 content and add substantial new material. Nothing from v1.0 was deleted; where a v1.0 statement was wrong or has been overtaken, it is marked and the correction explained in place.

### 6.3 Normalisation of identifiers

Version 1.0 used inconsistent naming in places. Version 2.0 fixes the following, and the v2.0 forms are authoritative:

| v1.0 form | v2.0 form | Reason |
| --- | --- | --- |
| `grant.disbursement_received` | `grant.disbursement.recorded` | Event naming convention is now `<context>.<entity>.<past-tense-verb>`; see [11](11-event-driven-architecture.md) |
| `employee.onboarded` | `hr.employee.onboarded` | Same convention; context prefix is mandatory |
| Seven roles | Eight roles | `auditor` added as a distinct read-plus-audit-log role; see [15](15-rbac-and-authorization.md) |
| Ten services | Fifteen services | Five services extracted from responsibilities that v1.0 left implicit; see [06](06-microservice-design.md) |
| `enrollments` used for two different tables | `lms_enrollments` and `program_enrollments` | The v1.0 ERD had a name collision across bounded contexts |

### 6.4 Corrections to v1.0

| Location in v1.0 | Issue | Resolution |
| --- | --- | --- |
| §6.2, `users.email UNIQUE` | Column-level `UNIQUE` makes email globally unique, which contradicts the stated intent of uniqueness per tenant and breaks the case where one person works for two tenant organisations | Replaced with a composite unique constraint on `(tenant_id, lower(email))`; see [08](08-database-schema.md) |
| §6.1, RLS policy `USING (tenant_id = auth.jwt() -> 'tenant_id')` | Compares a `UUID` to a `jsonb` value; the policy would either error or silently never match | Corrected to cast explicitly: `USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)`; see [29](29-multi-tenancy-and-tenant-lifecycle.md) |
| §6.5, `location_gps POINT` described as PostGIS | `POINT` is a native PostgreSQL geometric type, not PostGIS, and does not support spatial indexing or distance queries in the way the requirement implies | Changed to `GEOGRAPHY(Point, 4326)` from PostGIS with a GiST index; see [08](08-database-schema.md) |
| §6.4, `employees` table has no `tenant_id` | Every other table carries `tenant_id`; its omission here would break RLS on the most sensitive table in the system | `tenant_id` added; see [08](08-database-schema.md) |
| §4.2.5, "biometric-free registration with unique system ID" and §6.5 `unique_id VARCHAR(30) UNIQUE` | A globally unique constraint on a per-tenant identifier causes cross-tenant collisions and leaks the existence of other tenants' records through constraint violations | Scoped to `(tenant_id, unique_id)`; see [08](08-database-schema.md) |
| §11, "Zero data loss; eventual consistency < 5 seconds" | "Zero data loss" is not achievable with a one-hour RPO stated in the same table | Reconciled: RPO is 5 minutes for transactional data via continuous WAL archiving, and the zero-loss claim is scoped to committed transactions within a healthy primary; see [27](27-disaster-recovery-and-bcp.md) |
| §9.1, PostgreSQL StatefulSet on `db-pool` | Running the primary database on the same cluster as the application removes the isolation the security zone model claims | Clarified as development-only; all other environments use managed Cloud SQL; see [21](21-deployment-and-infrastructure.md) |
| Appendix C, vulnerability scoring | The listed weights sum to 100 only if every factor applies, and the text says both "maximum raw score = 100" and "normalised to 0–100", which is circular | Reformulated with explicit maximum-possible-score normalisation and worked examples; see [Appendix I](appendices/i-algorithms.md) |

---

## 7. Document conventions

### 7.1 Requirement language

| Keyword | Meaning |
| --- | --- |
| **MUST** / **MUST NOT** | Absolute requirement. Non-compliance blocks a merge or a release |
| **SHOULD** / **SHOULD NOT** | Strong recommendation. Deviation requires a recorded justification in the pull request |
| **MAY** | Optional. Included to signal that the option was considered and is permitted |

### 7.2 Naming

| Element | Form | Example |
| --- | --- | --- |
| Service | kebab-case, `-service` suffix except the gateway | `grant-service` |
| Database table | snake_case, plural | `grant_disbursements` |
| Column | snake_case, singular | `total_amount` |
| Enum type | snake_case, singular | `grant_status` |
| Event | `<context>.<entity>.<past-tense-verb>` | `grant.disbursement.recorded` |
| Permission | `<resource>:<sub-resource>:<action>` | `grant:disbursement:approve` |
| Role | snake_case | `finance_manager` |
| Redis key | `<tenant>:<namespace>:<identifier>` | `t_9f2a:burnrate:grant_31c8` |
| Metric | Prometheus convention, `_total`, `_seconds`, `_bytes` suffixes | `http_request_duration_seconds` |
| Environment variable | SCREAMING_SNAKE_CASE, service-prefixed | `GRANT_SERVICE_DB_URL` |
| Feature flag | kebab-case, verb-first | `enable-uganda-payroll` |
| Error code | `NGOIS-<DOMAIN>-<NNNN>` | `NGOIS-GRANT-0021` |
| ADR file | `NNNN-kebab-case-title.md` | `0002-hybrid-multi-tenancy-with-rls.md` |
| Runbook | `RB-NN` | `RB-02` |

### 7.3 Diagrams

All diagrams are authored in Mermaid inline in the Markdown source so they are diffable in review and cannot drift from the text they illustrate. No binary image assets are committed for architecture content. Diagrams follow the C4 model where a structural view is being shown: context, container, component, with code-level detail omitted deliberately.

### 7.4 Units and formats

| Quantity | Format |
| --- | --- |
| Money | `NUMERIC(15,2)` in storage; always paired with an ISO-4217 currency code. Never a floating-point type |
| Dates | ISO-8601. `DATE` for calendar dates, `TIMESTAMPTZ` for instants, always stored in UTC and rendered in the tenant timezone |
| Durations in prose | Explicit units, e.g. "300 ms", "7 days" |
| Percentiles | `p50`, `p95`, `p99` |
| Country | ISO-3166-1 alpha-2 |
| Language | BCP 47, e.g. `en-GB`, `ar-SS`, `sw-KE` |
| Timezone | IANA, e.g. `Africa/Juba` |

### 7.5 Cross-references

Cross-references use relative Markdown links to the chapter file, optionally with a section anchor. A reference to a numbered requirement uses the form `NFR-07` or `PRIN-03` so it survives renumbering of surrounding text. Broken links fail the documentation lint job in CI.

---

## 8. Related documents

| Document | Location | Relationship |
| --- | --- | --- |
| Product Requirements Document | Product wiki | Source of functional scope; this SDD implements it |
| Data Protection Impact Assessment | `docs/dpia/` | Summarised in [17](17-privacy-and-compliance.md); the DPIA is the legal record |
| Information Security Management System | `docs/isms/` | Organisational controls; this SDD covers technical controls |
| Donor compliance pack | Shared drive, controlled | Derived from this document |
| API reference | Generated from OpenAPI at build time | Normative for request/response shapes; [10](10-api-design-standards.md) is normative for the rules the shapes follow |
| Incident log | PagerDuty and `docs/postmortems/` | Feeds changes back into [26](26-reliability-and-incident-management.md) and [32](32-risk-register.md) |
