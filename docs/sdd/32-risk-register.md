# 32 — Risk Register

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Chapter:** 32 — Risk Register
> **Owner:** Executive Director, with the Chief Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Review Cadence:** Monthly; any risk scoring 20 or above is reviewed at every board meeting
> **Related ADRs:** —

---

## 32.1 Scoring

Probability and impact each on 1–5; **exposure = probability × impact**.

| Score | Probability | Impact |
| --- | --- | --- |
| 1 | Very unlikely within 3 years | Negligible |
| 2 | Possible | Minor — inconvenience, small cost |
| 3 | Likely within 3 years | Moderate — significant disruption or cost |
| 4 | Likely within 12 months | Major — regulatory exposure, tenant loss, or material harm |
| 5 | Near certain | **Severe — physical harm to a person, or the platform ceases to be viable** |

| Exposure | Band | Governance |
| --- | --- | --- |
| 20–25 | **Critical** | Board attention every meeting; mitigation is funded ahead of feature work |
| 12–16 | High | Monthly executive review; named owner reports progress |
| 6–10 | Medium | Quarterly review |
| 1–5 | Low | Annual review |

Impact 5 is reserved for outcomes that cannot be compensated. In this platform that means harm to a beneficiary. Financial loss, however large, is a 4.

---

## 32.2 The critical risks

Four risks score in the critical band. They receive disproportionate design attention throughout this document, and it is worth stating why they and not others.

| ID | Risk | P | I | **Exp** |
| --- | --- | --- | --- | --- |
| R-01 | Cross-tenant data exposure | 2 | 5 | **10** → treated as critical |
| R-02 | Beneficiary data reaches a party that could use it to cause harm | 2 | 5 | **10** → treated as critical |
| R-14 | Payroll produces statutorily incorrect results | 3 | 4 | **12** |
| R-31 | Platform workstreams squeezed by delivery pressure | 4 | 4 | **16** |

R-01 and R-02 score 10 arithmetically because the mitigations have reduced their probability. **They are nonetheless governed as critical**, because the impact is irreversible and the probability estimate is the least trustworthy number in this register — it rests on the assumption that the controls work, and the whole point of controls is that you cannot know they have failed until they have.

R-31 has the highest arithmetic exposure in the register, and it is an organisational risk rather than a technical one. That is not an accident of scoring. The technical risks are addressed by design; this one is addressed only by discipline.

---

## 32.3 Security and privacy risks

| ID | Risk | P | I | Exp | Mitigation | Trigger | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | **Cross-tenant data exposure** | 2 | 5 | 10 | Six independent isolation layers; blocking isolation suite; production canary every 15 min; per-tenant encryption keys as the last barrier; nightly IDOR sweep; annual pen test ([29](29-multi-tenancy-and-tenant-lifecycle.md)) | Canary failure; a tenant reports unfamiliar data; `rls_context_missing` above zero | Security Lead |
| R-02 | **Beneficiary data used to cause harm** | 2 | 5 | 10 | Minimised collection; per-tenant encryption; k-anonymity on anything published; IATI exclusion policy; purpose-logged access; no ethnicity or religion field unless DPO-approved; protection review of every beneficiary field ([17](17-privacy-and-compliance.md)) | Any confirmed exposure; a protection concern raised by a tenant | DPO |
| R-03 | `SET` without `LOCAL` leaks tenant context via the pool | 2 | 5 | 10 | Four independent controls: helper, Semgrep gate, integration test, zero-tolerance metric ([29 §29.3.3](29-multi-tenancy-and-tenant-lifecycle.md)) | Metric above zero; an intermittent wrong-data report | Data Architect |
| R-04 | PII egress to the LLM provider | 2 | 4 | 8 | Only k-anonymous aggregate views are readable; classification gate; redaction pipeline with second-pass verification; 400-fixture corpus; egress allow-list ([18 §18.5](18-ai-llm-architecture.md)) | Redaction failure metric above zero | Security Lead |
| R-05 | Prompt injection via a field submission | 3 | 3 | 9 | Structured context separation; instruction-hierarchy prompts; output guardrails; 60-payload corpus; no tool use from model output | An injection test regression; anomalous AI output | Security Lead |
| R-06 | Credential or signing key compromise | 2 | 4 | 8 | KMS-held keys, never exported; short-lived tokens; workload identity; no standing access; rotation runbook ([RB-09](runbooks/rb-09-secret-rotation.md)) | Secret scanner finding; anomalous auth pattern | Security Lead |
| R-07 | Insider misuse of platform access | 3 | 4 | 12 | No standing production access; break-glass with recorded justification and session recording; purpose-logged PII access; audit review; two-person rule on destructive operations ([15 §15.6](15-rbac-and-authorization.md)) | Break-glass use without a ticket; audit anomaly | Executive Director |
| R-08 | Ransomware | 2 | 4 | 8 | Retention-locked backups in a separate project with a separate key; immutability within the window; signed images with admission control; no standing write access to backups ([27 §27.7](27-disaster-recovery-and-bcp.md)) | Encryption activity; backup deletion attempt | Platform Lead |
| R-09 | Supply chain compromise via a dependency | 3 | 4 | 12 | Lockfiles; SBOM; provenance verification; signed images; admission control; dependency review on every PR; automated patching with SLAs ([22 §22.8](22-cicd-release-supply-chain.md)) | Advisory affecting a direct dependency | Platform Lead |
| R-10 | Audit trail tampering conceals an action | 2 | 4 | 8 | Hash chaining with periodic verification; append-only grants; the writing role cannot update or delete ([14 §14.7](14-security-architecture.md)) | Chain verification failure | Security Lead |
| R-11 | Erasure fails to remove data, or restore resurrects it | 2 | 4 | 8 | Tombstoning with verification queries; the erasure log replayed on every restore; a mandatory drill step ([RB-11](runbooks/rb-11-backup-restore-drill.md)) | Residue found in a verification query | DPO |
| R-12 | Vulnerability scoring produces discriminatory outcomes | 3 | 4 | 12 | Deterministic and explainable by design; no protected characteristic as an input; scores are advisory and never automate exclusion; annual review of distribution by group | A tenant or beneficiary challenges a score | Chief Architect |
| R-13 | A tenant misuses the platform for surveillance or targeting | 2 | 5 | 10 | Contractual prohibition; audit visibility for the tenant's own admin; no bulk beneficiary export without `org_admin` and an audit entry; a stated policy that we will terminate for it | A pattern of unusual bulk access | Executive Director |

R-12 and R-13 are the two risks in this register that a conventional SaaS risk assessment would not contain. They exist because the platform holds data about vulnerable people, and the harm need not come from an attacker.

---

## 32.4 Technical risks

| ID | Risk | P | I | Exp | Mitigation | Trigger | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-14 | **Payroll is statutorily incorrect** | 3 | 4 | 12 | Worked-example fixture corpus with zero tolerance; independent accountant review per jurisdiction; versioned hash-pinned rulesets; reproducibility guarantee; maker-checker; 95 per cent coverage floor ([31 §31.4.2](31-implementation-roadmap.md)) | A tenant or authority disputes a calculation; a statutory change we did not track | Data Architect |
| R-15 | A statutory rate change is missed | 3 | 4 | 12 | Quarterly review of both jurisdictions' schedules; effective-dated rulesets; a staleness alert on the ruleset review date | A budget announcement; a tenant query | Data Architect |
| R-16 | **Field data loss from a device** | 2 | 4 | 8 | 72-hour budget with monitoring of actual queue age; resumable idempotent sync; local encryption; explicit support guidance never to clear app data; escalation clock in [RB-16](runbooks/rb-16-sync-failure.md) | Sync failure over 6 h; a device reported lost with unsynced data | Field squad lead |
| R-17 | Support advice destroys unsynced data | 3 | 4 | 12 | The four "do not" instructions in the tenant comms template; a support script that forbids reinstall advice; support onboarding covers it explicitly | Any report of a reinstall being advised | Support Lead |
| R-18 | Silent data corruption | 2 | 4 | 8 | Constraints and foreign keys enforced in the database, not only the application; exact `NUMERIC` arithmetic; reconciliation reports; audit trail as a repair source | A reconciliation discrepancy | Data Architect |
| R-19 | A migration causes an outage or data loss | 3 | 3 | 9 | Expand-contract only; lock-safety analysis in CI; staging rehearsal against production-shaped volume; every migration backward-compatible so rollback is always available ([22 §22.6](22-cicd-release-supply-chain.md)) | A lock wait in staging; a migration exceeding its window | Data Architect |
| R-20 | Event loss or duplication corrupts derived state | 2 | 3 | 6 | Transactional outbox; at-least-once with idempotent handlers keyed on `event_id`; DLQ with replay; consumer lag alerting ([11](11-event-driven-architecture.md)) | DLQ depth above zero; lag alert | Chief Architect |
| R-21 | Database write capacity exhausted | 2 | 4 | 8 | Capacity model to Year 3 with headroom; vertical scaling path documented; sharding as a stated escape hatch; saturation alerting well before the ceiling ([25 §25.6](25-performance-and-capacity.md)) | Sustained CPU above 70 per cent; connection saturation | Platform Lead |
| R-22 | Offline conflict resolution produces a wrong programme outcome | 3 | 3 | 9 | Per-entity policy, never last-write-wins; conflicts surfaced to the tenant for a human decision; never auto-resolved by us ([13 §13.5](13-offline-first-architecture.md)) | A tenant reports incorrect merged data | Field squad lead |
| R-23 | An integration failure silently produces wrong numbers | 3 | 4 | 12 | FX staleness is explicitly a SEV-2; staleness surfaced in the UI, never hidden; circuit breakers with documented degradation per provider ([RB-15](runbooks/rb-15-integration-failure.md)) | FX age alert; a reconciliation gap | Platform Lead |
| R-24 | AI output reaches a donor as fact | 2 | 4 | 8 | Human-in-the-loop with named approval; persistent draft-only status; visual labelling until approved; citation requirements; numeric cross-check ([18 §18.6](18-ai-llm-architecture.md)) | An unapproved output found in a submitted report | Product |
| R-25 | Duplicate financial disbursement | 2 | 4 | 8 | Idempotency keys on every payment initiation; maker-checker; reconciliation against the provider; **never re-initiate a payment during an incident** ([RB-15](runbooks/rb-15-integration-failure.md)) | A reconciliation mismatch | Finance |
| R-26 | Accessibility or RTL regression ships | 3 | 2 | 6 | axe in CI; manual walkthroughs per release; RTL in the E2E suite ([19](19-frontend-architecture.md)) | A user report; an axe finding | Frontend Lead |
| R-27 | Test suite becomes unreliable and gates lose authority | 3 | 3 | 9 | Flake budget under 2 per cent; quarantine limited to 5 days; **isolation and payroll tests may never be quarantined** ([23 §23.3](23-testing-strategy.md)) | Flake rate above budget; a re-run culture appearing | QA Lead |

R-17 deserves a note. It scores 12 — as high as several sophisticated technical risks — because it is a human process failure with a data-loss outcome, and the fix is a support script rather than any amount of engineering.

---

## 32.5 Operational risks

| ID | Risk | P | I | Exp | Mitigation | Trigger | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-28 | Regional outage exceeds RTO | 2 | 4 | 8 | Warm standby with cross-region replica; quarterly failover drill; runbook rehearsed ([RB-12](runbooks/rb-12-region-failover.md)) | A regional incident | Platform Lead |
| R-29 | Backups are unrestorable when needed | 2 | 5 | 10 | **Weekly automated restore with decryption verification.** An unverified backup is not a backup; KMS key availability confirmed separately ([27 §27.3.2](27-disaster-recovery-and-bcp.md)) | Verification failure | Data Architect |
| R-30 | On-call coverage inadequate for a night or weekend SEV-1 | 3 | 3 | 9 | Documented and accepted constraint; escalation path; runbooks written for someone without prior context; offline runbook bundle ([26 §26.1](26-reliability-and-incident-management.md)) | An incident with unacceptable time-to-engage | Platform Lead |
| R-31 | **Platform workstreams squeezed by delivery pressure** | 4 | 4 | **16** | The 35 per cent allocation is protected at board level; phase gates are non-negotiable and evidenced; error budget policy halts feature work when breached ([31 §31.1](31-implementation-roadmap.md)) | A gate criterion proposed for deferral; toil above 20 per cent | Executive Director |
| R-32 | Key-person dependency | 4 | 3 | 12 | Runbooks that assume no prior knowledge; documented architecture; pairing on critical modules; no single-owner service; ADRs capture reasoning, not just decisions | A single engineer is the only route to a resolution | Executive Director |
| R-33 | Runbooks drift from reality and fail when used | 3 | 3 | 9 | Annual execution of every runbook; same-day correction after any use; the "last verified" date is a governed field ([28 §28.5](28-operational-runbooks.md)) | A runbook step failing during an incident | Platform Lead |
| R-34 | Alert fatigue causes a real alert to be missed | 3 | 3 | 9 | Alert on symptoms not causes; every alert has a runbook and a page-worthiness review; monthly noise review ([24 §24.7](24-observability.md)) | Above 2 pages per on-call day; a dismissed alert that mattered | Platform Lead |
| R-35 | A tenant onboarded with incomplete isolation | 2 | 5 | 10 | Provisioning is a single idempotent orchestrated job; **manual completion is forbidden**; isolation verified before activation ([RB-05](runbooks/rb-05-tenant-onboarding.md)) | A provisioning job failure completed by hand | Platform Lead |
| R-36 | Noisy neighbour degrades other tenants | 3 | 3 | 9 | Per-tenant quotas; round-robin report fairness; statement timeouts; per-tenant dashboards ([29 §29.5](29-multi-tenancy-and-tenant-lifecycle.md)) | Quota exceeded alert; latency correlating with one tenant | Platform Lead |
| R-37 | Configuration drift makes production unreproducible | 2 | 3 | 6 | Argo self-heal; daily empty-plan check; no manual cluster change survives ([21 §21.7](21-deployment-and-infrastructure.md)) | A non-empty plan; a self-heal event | Platform Lead |
| R-38 | Cost overrun | 3 | 3 | 9 | Monthly FinOps review; per-tenant attribution; budget alerts at 80 and 100 per cent; AI token caps ([33](33-cost-model-and-finops.md)) | Budget alert; a per-tenant cost outlier | Executive Director |

R-32 at 12 is the risk a small organisation systematically under-rates. The mitigation is almost entirely documentation quality, which is a large part of why this SDD exists in the form it does.

---

## 32.6 Contextual and field risks

The risks that come from where this platform operates rather than how it is built. A generic register would omit all of them.

| ID | Risk | P | I | Exp | Mitigation | Trigger | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-39 | Connectivity is worse or more intermittent than modelled | 4 | 3 | 12 | 72-hour budget; bandwidth discipline; resumable sync; paper fallback; the option to extend the budget per tenant ([13](13-offline-first-architecture.md)) | Queue age routinely above 24 h | Field squad lead |
| R-40 | **A device is seized or inspected at a checkpoint** | 3 | 5 | **15** | Local encryption at rest; no beneficiary list cached beyond operational need; remote wipe; short local retention; a device shows nothing useful when locked ([13 §13.3](13-offline-first-architecture.md)) | A tenant reports a seizure | Security Lead |
| R-41 | Access is compelled by an authority | 2 | 5 | 10 | Per-tenant keys mean we cannot decrypt one tenant's data with another's key; a documented policy of notifying the tenant where lawful; data minimisation limits what exists to compel | A legal demand | Executive Director |
| R-42 | A tenant's programme is disrupted, staff evacuated | 3 | 3 | 9 | Data survives independently of devices; read-only access retained during suspension; export always available | A tenant reports evacuation | Support Lead |
| R-43 | Power and infrastructure failure at a tenant office | 4 | 2 | 8 | The PWA works offline for office users too; no dependency on a tenant-side server | — | Field squad lead |
| R-44 | Field staff turnover erodes platform knowledge | 4 | 2 | 8 | Training via the LMS; a UI usable without training for the core journey; in-app guidance | Rising support volume on basics | Support Lead |
| R-45 | Currency instability makes historical financials misleading | 3 | 2 | 6 | Rates stored with every transaction; reports state the rate and date used; never retrospectively re-rate | — | Finance |
| R-46 | A donor requires data residency we cannot meet | 2 | 3 | 6 | Region is configurable per deployment; the architecture does not assume a single region | A donor requirement in a contract | Executive Director |
| R-47 | Regulatory change in a jurisdiction we operate in | 3 | 3 | 9 | Quarterly regulatory review; configurable retention; effective-dated rules | An announcement | DPO |

R-40 at 15 is the second-highest exposure in the register. It is a threat this platform must design for and a conventional SaaS product never considers: the relevant question is not whether an attacker can breach the server, but what a soldier at a roadblock learns from a phone.

---

## 32.7 Delivery risks

| ID | Risk | P | I | Exp | Mitigation | Trigger | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-48 | Hiring lags the staffing plan | 4 | 3 | 12 | Hire ahead of need; platform capability first; phases resequence rather than compress | An unfilled role over 8 weeks | Executive Director |
| R-49 | Scope growth from design partners | 4 | 2 | 8 | Change control; new scope displaces rather than adds | Any unbudgeted commitment | Product |
| R-50 | External dependency lead times block a gate | 3 | 3 | 9 | Long-lead items started in Phase 1: pen test, accountants, mobile money, data processing agreements ([31 §31.7.2](31-implementation-roadmap.md)) | A dependency not started on schedule | Executive Director |
| R-51 | Penetration test finds a structural issue late | 2 | 4 | 8 | Continuous security work; threat model maintained; an early advisory review before the formal test | Any Critical or High finding | Security Lead |
| R-52 | Payroll complexity exceeds the estimate | 3 | 3 | 9 | Buffer in Phase 2; the option to ship one jurisdiction first | Fixture corpus failures persisting past week 6 | Data Architect |
| R-53 | Funding shortfall truncates the roadmap | 2 | 4 | 8 | Phases are independently valuable; Phase 1 plus 2 is a viable product; nothing in the security baseline is deferrable | A funding decision | Executive Director |

---

## 32.8 Summary and governance

| Category | Risks | Critical band or governed as critical | High (12–16) | Medium | Low |
| --- | --- | --- | --- | --- | --- |
| Security and privacy | 13 | 2 governed as critical | 4 | 7 | — |
| Technical | 14 | — | 5 | 9 | — |
| Operational | 11 | 1 (R-31) | 3 | 7 | — |
| Contextual and field | 9 | 1 (R-40) | 2 | 6 | — |
| Delivery | 6 | — | 1 | 5 | — |
| **Total** | **53** | **4** | **15** | **34** | **—** |

### 32.8.1 Governance

| Band | Cadence | Requirement |
| --- | --- | --- |
| Critical, or governed as critical | Every board meeting | Owner reports control effectiveness with evidence, not intent |
| High (12–16) | Monthly executive review | Owner reports progress; a stalled mitigation escalates |
| Medium (6–10) | Quarterly | Reviewed for probability change |
| All | Semi-annually | Full re-scoring; new risks added; closed risks retired with a reason |

A risk is also re-scored immediately after any incident that touches it, and after any change to a control that mitigates it. A register reviewed only on schedule becomes a document about the past.

### 32.8.2 Where the register is most likely wrong

Three honest caveats:

**The probability estimates on R-01 and R-02 assume the controls work.** They are the least defensible numbers here. The production canary exists precisely because we do not trust the estimate.

**R-31 is scored by an organisation assessing its own discipline**, which is the least reliable form of assessment available. It is scored 4 on probability because the base rate for "engineering quality work gets deferred under delivery pressure" is very high, not because of anything specific to this team.

**The contextual risks are informed by operating experience rather than data.** R-40's probability of 3 is a judgement, and the tenants operating in South Sudan are better placed to correct it than we are. It should be reviewed with them rather than for them.
