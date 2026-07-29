# 28 — Operational Runbooks

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Chapter:** 28 — Operational Runbooks
> **Owner:** Platform Lead
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Review Cadence:** Each runbook quarterly, by execution
> **Related ADRs:** —

---

## 28.1 What a runbook is for

A runbook exists for one situation: a single engineer, alone, possibly at 02:00, who did not write the code involved and may never have seen this failure before. Everything about the format follows from that reader.

| Property | Requirement |
| --- | --- |
| **Executable, not explanatory** | Numbered commands with expected output. Background belongs in the linked chapter, not in step 4 |
| **Assumes no prior knowledge of this failure** | The reader knows the platform generally; they do not know this scenario |
| **Every command is copy-pasteable** | With placeholders in an obvious `<ANGLE_BRACKET>` form |
| **Every step states its expected result** | So the reader knows whether it worked before continuing |
| **Decision points are explicit** | "If X, go to step 9; if Y, go to step 14" |
| **Says when to escalate** | And to whom, by role. An engineer stuck at step 6 should not be deciding whether escalating is acceptable |
| **Says what not to do** | The destructive action that looks helpful is named and forbidden |
| **Verification is a step, not an assumption** | The runbook ends with proof that the problem is resolved |
| **Verified by execution** | Quarterly, in staging. A runbook that has never been executed is a hypothesis |

### 28.1.1 Format

Every runbook follows the same structure, so a reader under pressure never has to work out where the information is:

1. **Metadata** — ID, title, severity it applies to, owner, expected duration, last verified date.
2. **Symptoms** — what the engineer is looking at that brought them here.
3. **Impact** — who is affected and how, so severity can be confirmed or corrected.
4. **Prerequisites** — access required, tools, and any prior step.
5. **Do not** — the destructive actions to avoid.
6. **Procedure** — numbered steps with expected results and decision branches.
7. **Verification** — proof of resolution.
8. **Rollback** — how to undo the procedure if it makes things worse.
9. **Escalation** — when and to whom.
10. **Follow-up** — postmortem requirement, tickets, communication.

---

## 28.2 The runbook set

| ID | Runbook | Trigger | Sev | Duration |
| --- | --- | --- | --- | --- |
| [RB-01](runbooks/rb-01-failed-payroll-run.md) | Failed or stalled payroll run | `PayrollRunFailed`, `PayrollRunStalled`, or a tenant report | SEV-2, SEV-1 near a deadline | 30–90 min |
| [RB-02](runbooks/rb-02-dlq-drain-and-replay.md) | Dead letter queue drain and event replay | `EventsDeadLettered`, `EventConsumerLagCritical`, `OutboxRelayStalled` | SEV-2 | 30–120 min |
| [RB-03](runbooks/rb-03-database-failover.md) | Database failover and recovery | `DatabaseUnavailable`, `ReplicationLagHigh` | SEV-1 | 15–60 min |
| [RB-04](runbooks/rb-04-certificate-rotation.md) | Certificate rotation and expiry recovery | `CertificateExpiringSoon`, or TLS failures | SEV-3, SEV-1 if expired | 20–45 min |
| [RB-05](runbooks/rb-05-tenant-onboarding.md) | Tenant provisioning | A signed agreement | — | 2–4 h |
| [RB-06](runbooks/rb-06-tenant-offboarding.md) | Tenant offboarding and data deletion | Contract end | — | Over 30 days |
| [RB-07](runbooks/rb-07-pii-erasure-request.md) | Personal data erasure request | An approved erasure request | — | 1–2 h |
| [RB-08](runbooks/rb-08-scale-event.md) | Capacity and saturation response | Latency, connection, memory or queue alerts | SEV-2, SEV-3 | 15–45 min |
| [RB-09](runbooks/rb-09-secret-rotation.md) | Secret rotation, planned and emergency | Schedule, or suspected compromise | SEV-1 if compromised | 30 min–2 h |
| [RB-10](runbooks/rb-10-hotfix-deployment.md) | Hotfix deployment | A defect requiring a fix outside the normal cadence | — | 45–90 min |
| [RB-11](runbooks/rb-11-backup-restore-drill.md) | Backup restore and point-in-time recovery | `BackupVerificationFailed`, data corruption, or a drill | SEV-1 for real data loss | 1–6 h |
| [RB-12](runbooks/rb-12-region-failover.md) | Regional failover | Confirmed extended regional failure | SEV-1 | ~4 h |
| [RB-13](runbooks/rb-13-service-down.md) | Service unavailable or crash looping | `Tier1ServiceDown`, `PodCrashLooping`, `PlatformDown` | SEV-1, SEV-2 | 10–45 min |
| [RB-14](runbooks/rb-14-security-incident.md) | Security incident and suspected data exposure | `CrossTenantAccessDetected`, `PIIRedactionFailure`, `AuditChainBroken`, `AuthFailureSpike`, `BulkExportAnomalous` | **SEV-1** | Hours to days |
| [RB-15](runbooks/rb-15-integration-failure.md) | External integration failure | `CircuitBreakerOpen`, `IntegrationErrorRateHigh`, `FXRateStale` | SEV-2, SEV-3 | 20–60 min |
| [RB-16](runbooks/rb-16-sync-failure.md) | Field sync failure | `SyncFailureRateHigh`, `SyncVolumeAnomalous` | **SEV-2, escalating** | 30–120 min |

---

## 28.3 Common first steps

Before opening a specific runbook, four checks answer most of the triage question in under two minutes. They are here rather than repeated in sixteen files.

| # | Check | Command or location | Why |
| --- | --- | --- | --- |
| 1 | **What changed?** | The deployment annotations on dashboard D-01; `argocd app history <APP>` | A change in the last two hours is the most probable cause, and rollback is the fastest mitigation |
| 2 | **What is the blast radius?** | D-01 platform overview; is it one service, one tenant, or everything? | Determines severity and who to notify |
| 3 | **Is the data tier healthy?** | D-04 database dashboard; Cloud SQL status | A database problem presents as many simultaneous service problems, and chasing the services wastes the first twenty minutes |
| 4 | **Is anything already known?** | The incident channel; provider status pages for GCP and Cloudflare | Someone may already be working on it, and a provider incident changes the response entirely |

### 28.3.1 The mitigation-first reminder

Every runbook restates this because the instinct is to diagnose. The order of preference is roll back, flip a kill switch, scale, restart, fail over, shed load, and only then investigate under break-glass ([26 §26.4.1](26-reliability-and-incident-management.md)). Understanding the cause is the postmortem's job.

---

## 28.4 Access required

| Access | How obtained | Notes |
| --- | --- | --- |
| Kubernetes read-only | Standing, for the on-call role | Sufficient for most diagnosis |
| Kubernetes write | Break-glass, 2 h | Restarts, scaling, rollouts |
| Database read-only, non-PII | Break-glass, 2 h | Encrypted columns remain ciphertext |
| Database write | Break-glass with dual approval, except during a declared SEV-1 | Fully session-recorded |
| Cloud console | Break-glass | Infrastructure operations |
| Secret Manager | Break-glass, and access is itself alerted | Rotation only |
| Argo CD | Standing read, break-glass write | Rollback |
| Grafana, Loki, Tempo | Standing | Log access is audited |
| PagerDuty | Standing | — |
| Status page | Standing for the Communications role | — |

Break-glass procedure, approval rules and the audit requirement are in [15 §15.6](15-rbac-and-authorization.md). Self-approval is permitted during a declared SEV-1, and every grant is reviewed within 24 hours regardless.

---

## 28.5 Governance

| Activity | Cadence | Owner |
| --- | --- | --- |
| **Verify each runbook by executing it in staging** | Quarterly, rotating so each is done at least annually | Platform Lead |
| Update a runbook immediately after it is used in anger | Per use | The engineer who used it |
| Update after every drill | Per drill | The engineer who executed it |
| Review for accuracy against architecture changes | Per release affecting operations | The owning engineer |
| Add a runbook for any newly discovered failure mode | Per postmortem | Incident Commander |
| Confirm every alert names an existing runbook | Monthly, with the alert review | Platform Lead |
| Offline availability check — the PDF bundle is current | Quarterly | Platform Lead |

### 28.5.1 Two rules that keep the set trustworthy

**A runbook used in anger is updated the same day.** The gap between what the runbook said and what the engineer actually had to do is the most valuable information the organisation will get about that procedure, and it evaporates within about a week.

**Every alert must name a runbook, and every named runbook must exist.** This is checked automatically. An alert pointing at a missing runbook is a broken alert, because the engineer receiving it at 02:00 will follow the link.

### 28.5.2 The offline bundle

The runbook set is exported to a single PDF and distributed to every on-call engineer's laptop, refreshed quarterly. This exists for a specific scenario: an incident that takes down the documentation platform, or an engineer responding from a location with no usable connectivity. A runbook that can only be read when the platform is healthy is not an incident tool.
