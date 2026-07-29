# 30 — Quality Attributes and Non-Functional Requirements

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Chapter:** 30 — Quality Attributes and Non-Functional Requirements
> **Owner:** Chief Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Review Cadence:** Per release, with the acceptance criteria re-verified
> **Related ADRs:** —

---

## 30.1 How to read this chapter

Version 1.0 listed non-functional requirements as aspirations: "the system shall be highly available", "the system shall be secure". Those are not requirements, because nothing can be built or tested against them.

Every requirement here has four properties, and any requirement lacking them is not a requirement:

| Property | Meaning |
| --- | --- |
| **Measurable** | A number, a threshold, or a binary condition. Not an adjective |
| **Verifiable** | A named method that produces evidence |
| **Owned** | A named role accountable for it |
| **Traced** | A link to the chapter that specifies how it is achieved |

Structure follows ISO/IEC 25010. Priority uses MoSCoW, where **Must** means the platform does not ship without it.

### 30.1.1 Verification methods

| Code | Method |
| --- | --- |
| **A** | Automated test in CI; failure blocks the build |
| **L** | Load or performance test against staging at production-shaped scale |
| **M** | Manual test or inspection per release |
| **O** | Production observation against telemetry over a stated window |
| **R** | Document or design review by a named role |
| **X** | External audit or penetration test |
| **D** | Drill or exercise |

---

## 30.2 Functional suitability

| ID | Requirement | Acceptance criterion | Verify | Priority | Owner | Traced |
| --- | --- | --- | --- | --- | --- | --- |
| FS-01 | Payroll computes statutorily correct PAYE and social contributions for South Sudan and Uganda | 100 per cent agreement with the worked-example fixture set derived from published schedules; zero tolerance | A | Must | Data Architect | [Appendix I](appendices/i-algorithms.md) |
| FS-02 | Payroll is reproducible | Recomputing a run with the same ruleset hash yields byte-identical output | A | Must | Data Architect | [23 §23.4.2](23-testing-strategy.md) |
| FS-03 | Grant disbursements cannot exceed the award ceiling | Every attempt beyond the ceiling is rejected with the remaining amount stated | A | Must | Chief Architect | [10 §10.5](10-api-design-standards.md) |
| FS-04 | Financial arithmetic is exact | All monetary values `NUMERIC(15,2)`; no floating point anywhere in a money path; sums reconcile to the cent | A | Must | Data Architect | [08](08-database-schema.md) |
| FS-05 | Multi-currency values always carry an ISO-4217 code | No amount is displayed, exported or stored without its currency | A, M | Must | Frontend Lead | [19 §19.6](19-frontend-architecture.md) |
| FS-06 | Field data capture works fully offline | All capture functions available with no connectivity for 72 hours | A, M | Must | Field squad | [13](13-offline-first-architecture.md) |
| FS-07 | Vulnerability scoring is deterministic and explainable | The same inputs produce the same score; the contributing factors are displayable to the person affected | A | Must | Chief Architect | [Appendix I](appendices/i-algorithms.md) |
| FS-08 | Duplicate beneficiary registrations are detected, never silently merged | Probable duplicates are flagged for human review; automatic merging does not occur | A | Must | Field squad | [13 §13.6](13-offline-first-architecture.md) |
| FS-09 | IATI output validates against v2.03 | Schema validation passes; the exclusion policy is enforced | A | Should | Platform Lead | [12 §12.4](12-integration-architecture.md) |
| FS-10 | Reports reconcile with the underlying records | A finance manager reconciling by hand finds no discrepancy | M | Must | QA Lead | [23 §23.16](23-testing-strategy.md) |

---

## 30.3 Performance efficiency

| ID | Requirement | Acceptance criterion | Verify | Priority | Owner | Traced |
| --- | --- | --- | --- | --- | --- | --- |
| PE-01 | Read latency | p95 under 500 ms, p99 under 1 s, at the gateway | L, O | Must | Platform Lead | [25 §25.2.1](25-performance-and-capacity.md) |
| PE-02 | Write latency | p95 under 1 s | L, O | Must | Platform Lead | [25 §25.2.2](25-performance-and-capacity.md) |
| PE-03 | **Offline submission feels instant** | Under 200 ms perceived from submit to confirmation, with no network | A, M | Must | Frontend Lead | [25 §25.2.3](25-performance-and-capacity.md) |
| PE-04 | Sync throughput on 2G | 40 submissions complete within 90 s at 50 kbps, with visible incremental progress | L, M | Must | Field squad | [23 §23.8](23-testing-strategy.md) |
| PE-05 | Payroll run duration | 500 employees within 5 minutes; no other endpoint's p95 degrades more than 20 per cent during the run | L | Must | Data Architect | [23 §23.11.1](23-testing-strategy.md), L3 |
| PE-06 | Report generation | 95 per cent of standard reports within 30 s | L, O | Should | Platform Lead | [24 §24.8.1](24-observability.md), S-9 |
| PE-07 | Dashboard load | p95 under 1.5 s cached, under 3 s cold | L, O | Should | Platform Lead | [25 §25.2.1](25-performance-and-capacity.md) |
| PE-08 | Initial JS bundle | 180 KB gzipped or less | A | Must | Frontend Lead | [19 §19.8](19-frontend-architecture.md) |
| PE-09 | Mobile Core Web Vitals | LCP under 3 s on mid-range Android over 3G; CLS under 0.1; INP under 200 ms | A, O | Must | Frontend Lead | [19 §19.8](19-frontend-architecture.md) |
| PE-10 | No N+1 queries | Every list endpoint has a declared query budget, enforced in test | A | Must | Chief Architect | [25 §25.3.1](25-performance-and-capacity.md) |
| PE-11 | Cache effectiveness | Reference data hit ratio above 95 per cent; dashboards above 80 per cent | O | Should | Platform Lead | [25 §25.3.3](25-performance-and-capacity.md) |
| PE-12 | Concurrency | 400 concurrent users at the stated latency targets | L | Must | Platform Lead | [23 §23.11.1](23-testing-strategy.md), L2 |
| PE-13 | No memory growth under sustained load | 4-hour soak shows no upward heap trend and no connection leak | L | Must | Platform Lead | [23 §23.11.1](23-testing-strategy.md), L8 |
| PE-14 | Graceful degradation under overload | At the pool ceiling, requests are shed with 503 and `Retry-After` rather than the database being overwhelmed | L | Must | Platform Lead | [23 §23.11.1](23-testing-strategy.md), L10 |

---

## 30.4 Compatibility

| ID | Requirement | Acceptance criterion | Verify | Priority | Owner | Traced |
| --- | --- | --- | --- | --- | --- | --- |
| CO-01 | Browser support | Current and previous major of Chrome, Firefox, Safari, Edge; Chrome and Safari on mobile | A, M | Must | Frontend Lead | [19](19-frontend-architecture.md) |
| CO-02 | Low-end device support | The field capture journey is usable on a 2 GB RAM Android device with near-full storage | M | Must | QA Lead | [23 §23.16](23-testing-strategy.md) |
| CO-03 | API backward compatibility | No breaking change within a major version; additive changes only | A, R | Must | Chief Architect | [10 §10.11](10-api-design-standards.md) |
| CO-04 | Event schema compatibility | A consumer written against version N tolerates version N+1 | A | Must | Chief Architect | [11 §11.8](11-event-driven-architecture.md) |
| CO-05 | Export interoperability | CSV, XLSX and PDF open correctly in Excel, LibreOffice and Google Sheets, including non-Latin characters | M | Should | Product | — |
| CO-06 | Identity federation | Any standards-compliant OIDC provider can be configured | M | Could | Platform Lead | [12 §12.7](12-integration-architecture.md) |

---

## 30.5 Usability

| ID | Requirement | Acceptance criterion | Verify | Priority | Owner | Traced |
| --- | --- | --- | --- | --- | --- | --- |
| US-01 | **Accessibility** | WCAG 2.1 Level AA. Zero automated axe violations; manual keyboard and screen-reader walkthroughs pass | A, M, X | Must | Frontend Lead | [19 §19.7](19-frontend-architecture.md) |
| US-02 | Internationalisation | Full UI in English, Arabic and Swahili; no untranslated string in a shipped locale | A, M | Must | Frontend Lead | [19 §19.6](19-frontend-architecture.md) |
| US-03 | **Right-to-left layout** | Every journey completes correctly in Arabic; no mirrored logos or clocks; bidirectional text renders correctly | A, M | Must | Frontend Lead | [19 §19.6.1](19-frontend-architecture.md) |
| US-04 | Error messages are actionable | Every user-facing error states what happened and what to do. A 403 names the required permission | M, R | Must | Product | [19 §19.13](19-frontend-architecture.md) |
| US-05 | No unwarned data loss | Session expiry warns 2 minutes ahead; unsaved work is preserved across a crash | A, M | Must | Frontend Lead | [19 §19.13](19-frontend-architecture.md) |
| US-06 | Offline state is always visible | The user always knows whether they are online and whether their data has synced | M | Must | Field squad | [13](13-offline-first-architecture.md) |
| US-07 | New user task completion | A user unfamiliar with the platform completes a core task without assistance | M | Should | Product | [23 §23.16](23-testing-strategy.md) |
| US-08 | AI output is unmistakably labelled | Machine-generated content is visually distinct until approved | M | Must | Product | [18 §18.6.1](18-ai-llm-architecture.md) |
| US-09 | Dark mode | Full support; usable at night and in vehicles | M | Should | Frontend Lead | [19 §19.5.1](19-frontend-architecture.md) |

---

## 30.6 Reliability

| ID | Requirement | Acceptance criterion | Verify | Priority | Owner | Traced |
| --- | --- | --- | --- | --- | --- | --- |
| RE-01 | Platform availability | **99.5 per cent** over 30 days rolling, measured as non-5xx gateway requests | O | Must | Platform Lead | [24 §24.8.1](24-observability.md), S-1 |
| RE-02 | **Field sync availability** | **99.5 per cent** of sync sessions complete without platform-side failure | O | Must | Platform Lead | S-5 |
| RE-03 | **Submission durability** | **100 per cent.** Every accepted submission remains retrievable. Any loss is a SEV-1 with a postmortem | O, A | Must | Chief Architect | S-6 |
| RE-04 | **Payroll correctness** | **100 per cent** of runs complete without a computation error | O, A | Must | Data Architect | S-7 |
| RE-05 | Authentication availability | 99.9 per cent | O | Must | Platform Lead | S-4 |
| RE-06 | Event delivery | 99 per cent of events processed within 60 s; **no event lost**, guaranteed by the outbox | O, A | Must | Chief Architect | [11](11-event-driven-architecture.md) |
| RE-07 | RPO | Zero for committed transactions on a zone failure; 5 minutes maximum on a region failure | D | Must | Data Architect | [27 §27.2](27-disaster-recovery-and-bcp.md) |
| RE-08 | RTO | 4 hours for a regional failure; 60 seconds for a database failover | D | Must | Platform Lead | [27 §27.2](27-disaster-recovery-and-bcp.md) |
| RE-09 | Backup recoverability | A weekly automated restore succeeds, including decryption of a sampled record | A | Must | Data Architect | [27 §27.3.2](27-disaster-recovery-and-bcp.md) |
| RE-10 | Fault tolerance | Loss of any single pod, node or zone causes no user-visible error | D | Must | Platform Lead | [23 §23.12](23-testing-strategy.md), CH-1/2/11 |
| RE-11 | Graceful degradation | Every Tier 2 and Tier 3 service failure degrades as documented; no Tier 1 workflow is blocked | D, A | Must | Chief Architect | [06](06-microservice-design.md) |
| RE-12 | Poison message isolation | A malformed event does not stall its stream | A, D | Must | Chief Architect | CH-12 |
| RE-13 | Rollback capability | Any release can be rolled back within 5 minutes; every migration is backward-compatible | A, D | Must | Platform Lead | [22 §22.5.3](22-cicd-release-supply-chain.md) |
| RE-14 | Incident detection | Above 90 per cent of incidents detected by monitoring before a tenant reports them | O | Should | Platform Lead | [26 §26.8](26-reliability-and-incident-management.md) |
| RE-15 | MTTR | Under 30 minutes for mitigation of a SEV-1 | O | Should | Platform Lead | [26 §26.8](26-reliability-and-incident-management.md) |

---

## 30.7 Security

| ID | Requirement | Acceptance criterion | Verify | Priority | Owner | Traced |
| --- | --- | --- | --- | --- | --- | --- |
| SE-01 | **Tenant isolation** | **Zero cross-tenant data access.** The isolation suite passes on every commit; the production canary passes every 15 minutes | A, O, X | Must | Security Lead | [29 §29.9](29-multi-tenancy-and-tenant-lifecycle.md) |
| SE-02 | RLS coverage | Every tenant-owned table has RLS enabled **and forced**; verified post-migration; deployment blocked otherwise | A | Must | Data Architect | [29 §29.3](29-multi-tenancy-and-tenant-lifecycle.md) |
| SE-03 | No RLS bypass | Every service role is `NOBYPASSRLS` | A | Must | Data Architect | [29 §29.2.2](29-multi-tenancy-and-tenant-lifecycle.md) |
| SE-04 | Tenant context safety | No `SET` without `LOCAL`; a returned pooled connection carries no residual context | A | Must | Data Architect | [29 §29.3.3](29-multi-tenancy-and-tenant-lifecycle.md) |
| SE-05 | Authorisation completeness | The full RBAC matrix — 8 roles across every resource and action — is verified by generated tests | A | Must | Security Lead | [15](15-rbac-and-authorization.md) |
| SE-06 | Separation of duties | Payroll preparation and approval cannot be the same person; enforced by database constraint | A | Must | Data Architect | [15 §15.5](15-rbac-and-authorization.md) |
| SE-07 | PII encryption at rest | Every field in the classification inventory is encrypted at the application layer with per-tenant KMS keys | A, R | Must | Security Lead | [14 §14.4](14-security-architecture.md) |
| SE-08 | Encryption in transit | TLS 1.3 externally; mTLS internally; no plaintext path | A, X | Must | Security Lead | [14 §14.4.3](14-security-architecture.md) |
| SE-09 | No secret in code, image, log or trace | Secret scanning passes with zero findings; log and trace redaction verified by sampling | A, M | Must | Security Lead | [20 §20.3.2](20-configuration-secrets-feature-flags.md) |
| SE-10 | OWASP Top 10 | Every item mitigated and mapped; DAST finds no High | A, X | Must | Security Lead | [14 §14.6.1](14-security-architecture.md) |
| SE-11 | Vulnerability response | Critical patched within 24 h; High within 7 d | O | Must | Security Lead | [22 §22.8.2](22-cicd-release-supply-chain.md) |
| SE-12 | Supply chain | Every image signed, SBOM attached, provenance verified; admission control rejects anything else | A | Must | Platform Lead | [22 §22.8](22-cicd-release-supply-chain.md) |
| SE-13 | Audit completeness and integrity | Every mutation and every PII read recorded; the hash chain verifies | A, O | Must | Security Lead | [14 §14.7](14-security-architecture.md) |
| SE-14 | No standing production access | All human production access is break-glass, time-boxed, recorded and reviewed | R, O | Must | Security Lead | [15 §15.6](15-rbac-and-authorization.md) |
| SE-15 | Egress control | Only `integration-service` and `ai-insights-service` reach the internet, to an allow-list | A | Must | Platform Lead | [21 §21.5.1](21-deployment-and-infrastructure.md) |
| SE-16 | **No PII to the LLM provider** | The 400-fixture redaction corpus passes with zero leaks; `ngois_ai_redaction_failures_total` remains zero | A, O | Must | Security Lead | [18 §18.5](18-ai-llm-architecture.md) |
| SE-17 | Prompt injection resistance | 60-payload injection corpus: zero compliance with injected instructions | A | Must | Security Lead | [18 §18.12](18-ai-llm-architecture.md) |
| SE-18 | Penetration test | Annual; Critical and High remediated before the next release | X | Must | Security Lead | [23 §23.13](23-testing-strategy.md) |
| SE-19 | Ransomware resilience | Backups are retention-locked and undeletable within their window, in a separate project with a separate key | R, D | Must | Platform Lead | [27 §27.7.1](27-disaster-recovery-and-bcp.md) |

---

## 30.8 Privacy and compliance

| ID | Requirement | Acceptance criterion | Verify | Priority | Owner | Traced |
| --- | --- | --- | --- | --- | --- | --- |
| PR-01 | Data minimisation | Every personal data field has a recorded purpose; adding one requires the six-question gate and DPO approval | R | Must | DPO | [17 §17.6.1](17-privacy-and-compliance.md) |
| PR-02 | Purpose-logged PII access | Every read of Restricted data records who, what, when and why | A, O | Must | DPO | [17 §17.6](17-privacy-and-compliance.md) |
| PR-03 | Erasure | An approved request completes within 30 days, with no residue, and a certificate issued | A, M | Must | DPO | [17 §17.8](17-privacy-and-compliance.md) |
| PR-04 | Erasure survives restore | A restore replays the erasure log before the data is made available | A, D | Must | Data Architect | [RB-11](runbooks/rb-11-backup-restore-drill.md) |
| PR-05 | Data subject access | A request is fulfilled within 30 days in an intelligible form | M | Must | DPO | [17 §17.7](17-privacy-and-compliance.md) |
| PR-06 | Retention enforcement | Automated sweeps delete or de-identify at the retention boundary; nothing is retained past its period without a recorded hold | A, O | Must | Data Architect | [09 §9.6](09-data-management-strategy.md) |
| PR-07 | Residency | Personal data remains in the configured region; no processor outside it beyond hosting | R | Must | DPO | [17 §17.10](17-privacy-and-compliance.md) |
| PR-08 | **k-anonymity in published data** | No published aggregate represents a cohort under 5 | A | Must | DPO | [12 §12.4.3](12-integration-architecture.md) |
| PR-09 | Breach notification | Tenants within 24 h; regulator within 72 h where applicable; individuals where high risk, with protection advice | D, R | Must | DPO | [17 §17.11](17-privacy-and-compliance.md) |
| PR-10 | **No AI decision about a person** | No model output writes to any eligibility, scoring or targeting field | R, A | Must | Chief Architect | [18 §18.1](18-ai-llm-architecture.md), AI-3 |
| PR-11 | AI human-in-the-loop | No model output reaches a donor, beneficiary or financial record without a named human approval | A, M | Must | Product | [18 §18.6](18-ai-llm-architecture.md) |
| PR-12 | AI opt-out | A tenant may disable the AI module entirely with no loss of any workflow | A, M | Must | Product | [18 §18.13](18-ai-llm-architecture.md) |
| PR-13 | Donor audit retention | Financial and programme records retained per grant obligation, de-identified where personal data is erased | R, A | Must | Finance | [17 §17.9](17-privacy-and-compliance.md) |

---

## 30.9 Maintainability

| ID | Requirement | Acceptance criterion | Verify | Priority | Owner | Traced |
| --- | --- | --- | --- | --- | --- | --- |
| MA-01 | Test coverage | 80 per cent overall; **95 per cent on payroll, authorisation, encryption, redaction and vulnerability scoring**; coverage may not decrease | A | Must | QA Lead | [23 §23.4.1](23-testing-strategy.md) |
| MA-02 | Mutation score on critical modules | 80 per cent or above | A | Should | QA Lead | [23 §23.4](23-testing-strategy.md) |
| MA-03 | Type safety | TypeScript strict; zero errors; no `any` in domain code | A | Must | Chief Architect | [35](35-engineering-standards.md) |
| MA-04 | Module boundaries | No cross-module import in the frontend; no direct database access across service boundaries | A | Must | Chief Architect | [19 §19.3.1](19-frontend-architecture.md) |
| MA-05 | Configuration is schema-validated at boot | An invalid value prevents startup with exit code 78; no `process.env` read outside the schema | A | Must | Platform Lead | [20 §20.2.1](20-configuration-secrets-feature-flags.md) |
| MA-06 | Flag debt | No release flag more than 90 days past its removal date; CI fails otherwise | A | Must | Platform Lead | [20 §20.5.4](20-configuration-secrets-feature-flags.md) |
| MA-07 | Test suite reliability | Flake rate under 2 per cent; no test quarantined more than 5 working days | O | Must | QA Lead | [23 §23.3](23-testing-strategy.md) |
| MA-08 | Pipeline speed | Pull request feedback within 12 minutes; commit to production within 60 | O | Should | Platform Lead | [22 §22.10](22-cicd-release-supply-chain.md) |
| MA-09 | Architectural decisions are recorded | Every load-bearing decision has an ADR | R | Must | Chief Architect | [35 §35.5](35-engineering-standards.md) |
| MA-10 | Runbook accuracy | Every runbook executed at least annually; corrected the same day after any use | D | Must | Platform Lead | [28 §28.5](28-operational-runbooks.md) |
| MA-11 | Documentation currency | Every chapter reviewed on its stated cadence; no chapter over 12 months unreviewed | R | Should | Chief Architect | [00](00-front-matter.md) |
| MA-12 | Toil | Under 20 per cent of platform capacity on manual operational work | O | Should | Platform Lead | [26 §26.7.1](26-reliability-and-incident-management.md) |

---

## 30.10 Portability and operability

| ID | Requirement | Acceptance criterion | Verify | Priority | Owner | Traced |
| --- | --- | --- | --- | --- | --- | --- |
| PO-01 | Infrastructure reproducibility | The staging cluster is rebuilt from Terraform and Argo alone, within 90 minutes, with no undocumented manual step | D | Must | Platform Lead | [21 §21.9](21-deployment-and-infrastructure.md) |
| PO-02 | No configuration drift | A daily `terraform plan` against `main` is empty; Argo self-heal reverts manual cluster changes | A, O | Must | Platform Lead | [21 §21.7](21-deployment-and-infrastructure.md) |
| PO-03 | One artefact, all environments | The same image digest is promoted from staging to production; no rebuild | A | Must | Platform Lead | [21 §21.2.2](21-deployment-and-infrastructure.md) |
| PO-04 | Reproducible builds | The same source and lockfile produce the same digest; verified weekly | A | Should | Platform Lead | [22 §22.4.1](22-cicd-release-supply-chain.md) |
| PO-05 | Observability completeness | Every service satisfies the 12-item onboarding checklist before production | R | Must | Platform Lead | [24 §24.11.1](24-observability.md) |
| PO-06 | Every alert has a runbook | Verified automatically; an alert pointing at a missing runbook fails the check | A | Must | Platform Lead | [28 §28.5.1](28-operational-runbooks.md) |
| PO-07 | Provider abstraction where cheap | Cloud-specific coupling is limited to the IaC layer and three managed services; no cloud SDK in domain code | R | Should | Chief Architect | [34](34-future-extensibility.md) |
| PO-08 | Zero-downtime deployment | No planned user-visible downtime for a standard release, including migrations | O | Must | Platform Lead | [22 §22.6](22-cicd-release-supply-chain.md) |
| PO-09 | New country payroll onboarding | A new jurisdiction's rules can be added as configuration plus a rule module, without changing the engine | R | Should | Data Architect | [34](34-future-extensibility.md) |

---

## 30.11 Business continuity in the field

Requirements arising from the operating context that do not fit a standard ISO category, and which would be omitted from a conventional NFR list.

| ID | Requirement | Acceptance criterion | Verify | Priority | Owner | Traced |
| --- | --- | --- | --- | --- | --- | --- |
| BC-01 | 72-hour offline budget | A device retains and later syncs 72 hours of capture with zero loss | A, D | Must | Field squad | [13 §13.8](13-offline-first-architecture.md) |
| BC-02 | Sync is resumable | An interruption at any batch boundary resumes correctly, with no duplicate and no gap | A | Must | Field squad | [23 §23.8](23-testing-strategy.md) |
| BC-03 | Bandwidth discipline | No polling; no prefetch on a metered or 2G connection; images compressed client-side before upload | A, R | Must | Frontend Lead | [19 §19.8.1](19-frontend-architecture.md) |
| BC-04 | Device loss safety | An unsynced device at rest yields no readable data; remote wipe works | A, M | Must | Security Lead | [13 §13.3](13-offline-first-architecture.md) |
| BC-05 | Clock skew tolerance | A device clock 6 hours out produces correct ordering and preserves `captured_at` | A | Must | Field squad | [23 §23.8](23-testing-strategy.md) |
| BC-06 | Paper fallback | Pre-numbered forms and a tested bulk entry path exist for outages beyond 7 days | D | Should | Product | [27 §27.8](27-disaster-recovery-and-bcp.md) |
| BC-07 | Field teams are told early | A sync incident notifies supervisors within 30 minutes, with explicit instructions not to clear app data | D | Must | Support Lead | [RB-16](runbooks/rb-16-sync-failure.md) |

BC-07 exists as a formal requirement because the most damaging outcome of a sync incident is not the outage; it is a well-meaning instruction to reinstall the app.

---

## 30.12 Explicit non-requirements

Stating what the platform does not commit to is as useful as stating what it does, because an unstated non-requirement gets assumed into existence during design review.

| Not a requirement | Reason |
| --- | --- |
| Active-active multi-region | The complexity is disproportionate to a 4-hour RTO at this scale ([ADR-0016](adr/0016-single-region-with-warm-dr.md)) |
| Sub-100 ms global latency | Users are concentrated in East Africa; a single region serves them best |
| Horizontal write scaling | A single PostgreSQL primary suffices well beyond the planning horizon ([25 §25.7.1](25-performance-and-capacity.md)) |
| Real-time collaborative editing | No workflow requires it |
| Native mobile applications | A PWA meets the field requirement at a fraction of the cost ([34](34-future-extensibility.md)) |
| Offline capability for finance and HR modules | Those users have connectivity; the complexity is not justified |
| Support for browsers older than the previous major | Security and cost |
| Beneficiary-facing self-service | A significant protection and design question, deliberately out of scope |
| AI-assisted decision-making about people | Prohibited by design, not deferred ([18 §18.1](18-ai-llm-architecture.md)) |
| Tenant-configurable statutory tax rates | Would make statutory correctness unverifiable ([29 §29.6](29-multi-tenancy-and-tenant-lifecycle.md)) |
| A service mesh | Operational cost exceeds benefit at fifteen services ([21 §21.1](21-deployment-and-infrastructure.md)) |
| SOC 2 Type II certification at launch | Controls are designed to be compatible; certification is a Phase 4+ commercial decision ([17 §17.12](17-privacy-and-compliance.md)) |

---

## 30.13 Verification summary

| Category | Requirements | Must | Automated | Requires a drill or external audit |
| --- | --- | --- | --- | --- |
| Functional suitability | 10 | 9 | 9 | — |
| Performance efficiency | 14 | 10 | 12 | — |
| Compatibility | 6 | 3 | 4 | — |
| Usability | 9 | 7 | 5 | 1 external |
| Reliability | 15 | 13 | 9 | 6 drills |
| Security | 19 | 19 | 16 | 2 external |
| Privacy and compliance | 13 | 13 | 8 | 1 drill |
| Maintainability | 12 | 8 | 9 | 1 drill |
| Portability and operability | 9 | 6 | 6 | 1 drill |
| Business continuity | 7 | 6 | 5 | 2 drills |
| **Total** | **114** | **94** | **83** | **14 drills, 3 external** |

Of 114 requirements, 83 are verified automatically on every commit. That proportion is the point: a requirement verified only by review or by a quarterly drill is a requirement that will silently stop being met.

The remaining 31 are the ones needing deliberate attention, and they are exactly the ones most likely to decay — disaster recovery, accessibility, penetration testing, runbook accuracy, and the field-context requirements that no CI job can exercise.
