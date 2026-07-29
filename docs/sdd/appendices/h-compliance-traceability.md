# Appendix H — Compliance Traceability Matrix

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Owner:** DPO, with the Security Lead
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Review Cadence:** Quarterly, and on any regulatory change

---

## H.1 Purpose and honest scope

This matrix maps external obligations to the sections that implement them and the evidence that demonstrates they hold. It exists to answer a donor's due-diligence questionnaire, a tenant's data protection assessment, or an auditor's request without reconstructing the argument each time.

Two statements of scope, made plainly because overstating compliance is worse than not claiming it:

**The platform is not certified against anything.** No SOC 2 report, no ISO 27001 certificate, no formal GDPR certification. Controls are **designed to be compatible** with those frameworks so that certification is a documentation and audit exercise rather than a re-architecture, but as of this revision none has been audited by a third party except the annual penetration test ([17 §17.12](../17-privacy-and-compliance.md)).

**We are a processor, not a controller.** For beneficiary and employee data the tenant is the controller and we are the processor. Several obligations below are therefore *shared*: we provide the mechanism, the tenant makes the decision. The distinction matters in every row concerning lawful basis, consent and erasure.

### H.1.1 Evidence types

| Code | Evidence |
| --- | --- |
| **A** | Automated test in CI; a failure blocks the build |
| **O** | Production telemetry over a stated window |
| **D** | Drill or exercise record |
| **R** | Design or document review by a named role |
| **X** | External assessment |
| **L** | Log or audit record |
| **C** | Contractual instrument |

---

## H.2 GDPR and equivalent data protection law

Applicable through EU-based donors, EU-registered tenants, and adopted as the baseline standard regardless.

| Article | Obligation | Implemented by | Evidence | Status |
| --- | --- | --- | --- | --- |
| Art. 5(1)(a) | Lawfulness, fairness, transparency | [17 §17.5](../17-privacy-and-compliance.md); per-purpose consent records; tenant-facing privacy notice templates | R, C | Shared with tenant |
| Art. 5(1)(b) | Purpose limitation | Every personal data field carries a recorded purpose; the six-question gate on any addition ([17 §17.6.1](../17-privacy-and-compliance.md)) | R, A | Met |
| Art. 5(1)(c) | **Data minimisation** | The DPO approval gate; the closed field catalogue; no ethnicity, religion or political affiliation field ([Appendix B §B.5](b-data-dictionary.md)) | R, A | Met |
| Art. 5(1)(d) | Accuracy | Field-authoritative conflict policy; correction workflows; audit of every change ([ADR-0005](../adr/0005-offline-conflict-resolution-policy.md)) | A | Met |
| Art. 5(1)(e) | Storage limitation | Automated retention sweeps; the retention matrix ([09 §9.6](../09-data-management-strategy.md)) | A, O | Met |
| Art. 5(1)(f) | Integrity and confidentiality | [14](../14-security-architecture.md); six isolation layers; per-tenant encryption | A, O, X | Met |
| Art. 5(2) | Accountability | This document; the audit trail; ADRs; DPIA | R, L | Met |
| Art. 12–14 | Transparent information | Tenant-facing notice templates in three languages; AI labelling ([18 §18.13](../18-ai-llm-architecture.md)) | R | Shared |
| Art. 15 | Right of access | Subject access procedure, 30 days ([17 §17.7](../17-privacy-and-compliance.md)) | D | Met |
| Art. 16 | Right to rectification | Correction workflows with audit | A | Met |
| **Art. 17** | **Right to erasure** | [RB-07](../runbooks/rb-07-pii-erasure-request.md); tombstoning; the erasure log **replayed on every restore**; deletion certificate | A, D, L | Met |
| Art. 18 | Right to restriction | Processing restriction flag per purpose | A | Met |
| Art. 20 | Data portability | Tenant export in JSON and CSV, decrypted ([29 §29.8](../29-multi-tenancy-and-tenant-lifecycle.md)) | A | Met |
| Art. 21 | Right to object | Consent withdrawal per purpose | A | Shared |
| **Art. 22** | **No solely automated decision-making** | **Prohibited by design**: no AI output may write to any eligibility, scoring or targeting field; vulnerability scores are advisory and explainable ([ADR-0010](../adr/0010-llm-provider-and-boundaries.md), AI-3) | A, R | Met |
| Art. 24, 25 | **Data protection by design and by default** | Encryption by default on classified fields; minimisation gate; fail-closed RLS; k-anonymity on publication | A, R | Met |
| Art. 28 | Processor obligations | Data processing agreements; sub-processor register; no sub-processor beyond hosting and the named third parties | C, R | Met |
| Art. 30 | Records of processing | The classification inventory and purpose register ([Appendix B §B.9](b-data-dictionary.md)) | R | Met |
| Art. 32 | Security of processing | Encryption at rest and in transit; access control; testing; the full security chapter | A, O, X | Met |
| **Art. 33, 34** | **Breach notification** | 24 h to tenants, 72 h to regulator where applicable, individuals where high risk **with protection advice** ([17 §17.11](../17-privacy-and-compliance.md), [RB-14](../runbooks/rb-14-security-incident.md)) | D, R | Met |
| Art. 35 | **DPIA** | Completed and DPO-approved; updated for beneficiary processing at Phase 3 ([17 §17.13](../17-privacy-and-compliance.md)) | R | Met |
| Art. 37–39 | DPO | Appointed, 0.5 FTE, with external counsel on retainer; holds a hard approval gate | C, R | Met |
| Art. 44–49 | International transfers | Residency configured per tenant; DR failover to Europe **communicated as a transfer event** ([RB-12](../runbooks/rb-12-region-failover.md)) | R, C | Met |

### H.2.1 The two rows that required the most design

**Art. 17 erasure** is not satisfied by a `DELETE`. The obligation survives backups, and a naive implementation resurrects erased data at the first restore. The platform records every erasure in a log that is **replayed as a mandatory step of any restore**, verified in the quarterly drill ([RB-11 §5.6](../runbooks/rb-11-backup-restore-drill.md)). Without that step, the control would appear to work for years and then silently fail once.

**Art. 22** is met by prohibition rather than by safeguards. The straightforward reading would permit automated decisions with human review and explanation; the platform instead forbids model output from reaching any decision field at all. For decisions about who receives assistance in a conflict setting, "a human reviewed it" is too weak a protection when the human is under time pressure and the output looks authoritative.

---

## H.3 Humanitarian data protection

Not law, but the standards tenants and donors hold us to, and in several places stricter than law.

| Standard | Obligation | Implemented by | Evidence |
| --- | --- | --- | --- |
| **ICRC Handbook on Data Protection in Humanitarian Action** — do no harm | Data must not increase risk to affected people | The governing principle of [17 §17.2](../17-privacy-and-compliance.md); protection review of every beneficiary field; encrypted precise location; k-anonymity on publication | R |
| ICRC — data minimisation in conflict settings | Collect only what is operationally necessary | The six-question gate; no protected characteristics by default | R, A |
| ICRC — consent limitations | Recognise that consent may not be freely given where assistance depends on it | Consent recorded per purpose, with lawful basis recorded separately where consent is not a valid basis | R |
| ICRC — third-party access and compelled disclosure | Minimise what can be compelled | Per-tenant keys; data minimisation; tenant notification where lawful ([32](../32-risk-register.md) R-41) | R, C |
| **Sphere Standards** — dignity and participation | Beneficiaries should understand what is held about them | Explainable vulnerability scores; tenant-facing notices | R |
| **Core Humanitarian Standard** commitment 4 | Communication and participation | Score explainability; erasure and access mechanisms | R |
| **IASC** guidance on protection information management | Purpose specification, minimisation, secure handling | Classification inventory; purpose logging | A, L |
| Sector practice — device risk in conflict settings | A device must not compromise the people in it | Local encryption; minimal local caching; remote wipe; short retention ([32](../32-risk-register.md) R-40) | A, R |

### H.3.1 Where humanitarian standards exceed legal requirement

Three controls exist for protection reasons and are not required by any data protection statute.

| Control | Legal position | Why it exists anyway |
| --- | --- | --- |
| **k = 5 minimum cohort on any published aggregate** | No statute requires it | A district-level figure of "2 households" in a small area identifies them |
| **Precise location encrypted; only coarse area in plain text** | Not required | A GPS coordinate identifies a dwelling; a district does not ([Appendix B §B.9.1](b-data-dictionary.md)) |
| **IATI exclusion policy overriding tenant configuration** | A tenant could lawfully choose to publish more | Publication is public and permanent. A tenant cannot consent on a beneficiary's behalf to permanent public disclosure ([12 §12.4.3](../12-integration-architecture.md)) |

---

## H.4 Donor requirements

| Donor or standard | Requirement | Implemented by | Evidence |
| --- | --- | --- | --- |
| **USAID** | Financial records retained 3 years after final payment | Retention matrix; de-identified retention survives erasure | A, R |
| USAID | Segregation of duties on disbursement | Maker-checker enforced by database constraint ([Appendix C §C.4](c-rbac-matrix.md)) | A |
| USAID | Audit trail of financial transactions | Hash-chained append-only audit log | A, L |
| USAID | Sub-award tracking | Sub-grant model in [07](../07-domain-model-and-erd.md) | R |
| **FCDO** | Due diligence and fraud controls | Maker-checker; approval workflows; anomaly detection | A, O |
| FCDO | Value-for-money reporting | Budget versus actual; cost allocation to grants | A |
| **ECHO / EU** | Data protection equivalent to GDPR | [§H.2](#h2-gdpr-and-equivalent-data-protection-law) | — |
| **UNHCR** | Data sharing under agreement only | Export controls; audit of every export | A, L, C |
| **IATI v2.03** | Standard-conformant publication | [12 §12.4](../12-integration-architecture.md); schema validation in CI | A |
| IATI | Exclusion of personal data from publication | **The exclusion policy, verified against a deliberately-seeded PII fixture** ([RB-15 §5.6](../runbooks/rb-15-integration-failure.md)) | A |
| **Donor audit generally** | Reconstructable financial history | Immutable disbursement records; reversals as new rows; FX rate stored with each transaction | A, L |
| Donor audit | Records intelligible years later | De-identified retention; `payroll_record_lines` itemisation with statutory citations | R |

### H.4.1 The tension this creates, and how it is resolved

Data protection says delete personal data; donor accountability says retain financial records for up to seven years. Both are binding.

The resolution is **de-identified retention**: personal data is tombstoned, while the financial and programme records referencing it persist without identifying anyone. A 2024 reach figure remains accurate in a 2029 audit even though no individual in it is identifiable ([RB-06 §5.4](../runbooks/rb-06-tenant-offboarding.md)).

This is why erasure is defined narrowly in [Appendix A §A.5](a-glossary.md) and why a deletion certificate states what was removed *and* what was retained and why. A tenant that expects erasure to mean "the record is gone" needs to be told otherwise before they promise it to a beneficiary.

---

## H.5 Statutory payroll obligations

| Jurisdiction | Obligation | Implemented by | Evidence |
| --- | --- | --- | --- |
| **South Sudan (NRA)** | PAYE withholding at published rates | Effective-dated `tax_bands` with statutory citations; fixture corpus with zero tolerance | A, X |
| South Sudan (NSIF) | Social insurance contributions, employer and employee | `statutory_contribution_rates` with basis and citation | A, X |
| **Uganda (URA)** | PAYE withholding | As above | A, X |
| Uganda (NSSF) | Social security contributions | As above | A, X |
| Uganda | Local Service Tax | Rule module component | A |
| Both | Payslip provided to each employee | `payroll:payslip:read_own`; itemised lines | A |
| Both | Employer records retained per statute | Retention matrix; payroll data in per-tenant schemas | A, R |
| Both | Accurate and timely remittance | Reconciliation reports; bank file export | A |

**Evidence type X on every tax row is deliberate.** Automated tests prove the arithmetic matches the fixtures; they cannot prove the fixtures match the statute. That requires an **independent accountant review per jurisdiction**, which is a blocking gate on the Phase 2 release ([31 §31.4.2](../31-implementation-roadmap.md), criterion 13). Nobody on the engineering team is qualified to certify a tax schedule.

---

## H.6 Security framework alignment

Mapped, not certified.

| Framework | Domain | Implemented by | Gap |
| --- | --- | --- | --- |
| **SOC 2** — Security | Access control, encryption, monitoring, change management | [14](../14-security-architecture.md), [15](../15-rbac-and-authorization.md), [22](../22-cicd-release-supply-chain.md), [24](../24-observability.md) | **No Type II audit.** Requires an observation period and an auditor |
| SOC 2 — Availability | SLOs, DR, capacity | [24 §24.8](../24-observability.md), [27](../27-disaster-recovery-and-bcp.md), [25](../25-performance-and-capacity.md) | As above |
| SOC 2 — Confidentiality | Classification, encryption, isolation | [17](../17-privacy-and-compliance.md), [29](../29-multi-tenancy-and-tenant-lifecycle.md) | As above |
| SOC 2 — Processing integrity | Payroll correctness, reconciliation, audit | [Appendix I](i-algorithms.md), [30 FS-01–FS-04](../30-quality-attributes-nfr.md) | As above |
| SOC 2 — Privacy | Consent, rights, retention | [17](../17-privacy-and-compliance.md) | As above |
| **ISO 27001** A.5 Policies | This document set; engineering standards | [35](../35-engineering-standards.md) | No ISMS as a formal management system |
| ISO 27001 A.6 Organisation | Roles, segregation of duties, DPO | [15](../15-rbac-and-authorization.md), [31 §31.6](../31-implementation-roadmap.md) | — |
| ISO 27001 A.8 Asset management | Asset register; classification | [16](../16-threat-model-stride.md), [Appendix B](b-data-dictionary.md) | — |
| ISO 27001 A.9 Access control | RBAC, no standing access, break-glass | [15](../15-rbac-and-authorization.md) | — |
| ISO 27001 A.10 Cryptography | Key management, rotation | [14 §14.4](../14-security-architecture.md), [RB-09](../runbooks/rb-09-secret-rotation.md) | — |
| ISO 27001 A.12 Operations | Change management, backup, logging, malware | [22](../22-cicd-release-supply-chain.md), [27](../27-disaster-recovery-and-bcp.md), [24](../24-observability.md) | — |
| ISO 27001 A.14 Development | Secure development, testing, separation of environments | [23](../23-testing-strategy.md), [21 §21.2](../21-deployment-and-infrastructure.md) | — |
| ISO 27001 A.16 Incident management | Severities, response, postmortems | [26](../26-reliability-and-incident-management.md) | — |
| ISO 27001 A.17 Continuity | DR, BCP, drills | [27](../27-disaster-recovery-and-bcp.md) | — |
| **OWASP Top 10 (2021)** | All ten | [14 §14.6.1](../14-security-architecture.md) | None; DAST finds no High |
| **OWASP ASVS L2** | Verification standard | Largely met through [14](../14-security-architecture.md) and [23](../23-testing-strategy.md) | Not formally assessed against the checklist |
| **SLSA** | Build Level 3 | [22 §22.8](../22-cicd-release-supply-chain.md) | Provenance and isolation met; not externally attested |
| **CIS Kubernetes Benchmark** | Cluster hardening | [21 §21.4](../21-deployment-and-infrastructure.md) | Not continuously scanned |

### H.6.1 The honest gaps

Four, stated so a reader does not have to infer them.

| Gap | Consequence | Position |
| --- | --- | --- |
| No SOC 2 Type II | Some institutional donors and larger NGOs will ask for it | A Phase 4+ commercial decision. Controls are designed to be auditable, so the work is evidence collection rather than redesign |
| No ISO 27001 ISMS | Same | Same |
| ASVS not formally assessed | Unknown residual gaps against a detailed checklist | Candidate for the next penetration test scope |
| CIS benchmark not continuously scanned | Cluster configuration drift could go unnoticed | Argo self-heal and the empty-plan check cover configuration drift; benchmark scanning is a gap ([30 PO-02](../30-quality-attributes-nfr.md)) |

---

## H.7 Traceability summary

| Framework | Obligations mapped | Automated evidence | Requires a drill | Requires external assessment | Gaps |
| --- | --- | --- | --- | --- | --- |
| GDPR | 24 | 17 | 4 | 1 | 0 |
| Humanitarian standards | 8 | 3 | — | — | 0 |
| Donor requirements | 12 | 9 | — | 1 | 0 |
| Statutory payroll | 8 | 8 | — | **4** | 0 |
| Security frameworks | 18 | 12 | 2 | 3 | **4** |
| **Total** | **70** | **49** | **6** | **9** | **4** |

Forty-nine of seventy obligations are evidenced by a test that runs on every commit. That is the number worth defending: an obligation evidenced only by a document review is an obligation that will quietly stop being met when the code changes and nobody re-reads the document.

The nine requiring external assessment cluster in two places — payroll statutory correctness and security framework certification — and both are correctly outside engineering's competence to self-certify.
