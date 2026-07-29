# Appendix G — Runbook Index

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Owner:** Platform Lead
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Framework and governance:** [28](../28-operational-runbooks.md)

---

## G.1 The index

Sixteen runbooks. Each is written to be executed by someone with no prior context on the specific failure, at an hour when judgement is poor.

Each row restates the runbook's own header block, which is authoritative.

| ID | Runbook | Applies to | Severity | Duration |
| --- | --- | --- | --- | --- |
| [RB-01](../runbooks/rb-01-failed-payroll-run.md) | Failed or Stalled Payroll Run | `PayrollRunFailed`, `PayrollRunStalled`, or a tenant reporting a run that will not complete | SEV-2. **SEV-1 if a statutory payment deadline is within 48 hours** | 30–90 min |
| [RB-02](../runbooks/rb-02-dlq-drain-and-replay.md) | Dead Letter Queue Drain and Event Replay | `EventsDeadLettered`, `EventConsumerLagCritical`, `OutboxRelayStalled`, `RedisEvictionsOccurring` | SEV-2 | 30–120 min |
| [RB-03](../runbooks/rb-03-database-failover.md) | Database Failover and Recovery | `DatabaseUnavailable`, `ReplicationLagHigh`, Cloud SQL maintenance failure | **SEV-1** | 15–60 min |
| [RB-04](../runbooks/rb-04-certificate-rotation.md) | Certificate Rotation and Expiry Recovery | `CertificateExpiringSoon`, TLS handshake failures, private CA root rotation | SEV-3 when expiring; **SEV-1 when expired** | 20–45 min |
| [RB-05](../runbooks/rb-05-tenant-onboarding.md) | Tenant Provisioning | A signed tenant agreement and a completed onboarding intake | Not an incident | 2–4 h of platform work, spread over a 2-week onboarding |
| [RB-06](../runbooks/rb-06-tenant-offboarding.md) | Tenant Offboarding and Data Deletion | Contract end, tenant-requested termination, or termination for cause | Not an incident | 30–90 days elapsed; roughly 3 h of platform work |
| [RB-07](../runbooks/rb-07-pii-erasure-request.md) | Personal Data Erasure Request | An approved erasure request for a beneficiary, an employee, or a system user | Not an incident. SLA-bound at 30 days | 1–2 h of work within a 30-day SLA |
| [RB-08](../runbooks/rb-08-scale-event.md) | Capacity and Saturation Response | `LatencyHigh`, `DatabaseConnectionsHigh`, `DatabasePoolWaitHigh`, `RedisMemoryHigh`, `NotificationBacklog`, `DiskGrowthAnomalous` | SEV-2 or SEV-3 | 15–45 min |
| [RB-09](../runbooks/rb-09-secret-rotation.md) | Secret Rotation, Planned and Emergency | `SecretRotationOverdue`, scheduled rotation, or suspected credential compromise | Not an incident when planned. **SEV-1 when compromised** | 30 min planned; up to 2 h emergency |
| [RB-10](../runbooks/rb-10-hotfix-deployment.md) | Hotfix Deployment | A defect requiring a fix outside the normal release cadence | Follows the incident it addresses | 45–90 min |
| [RB-11](../runbooks/rb-11-backup-restore-drill.md) | Backup Restore and Point-in-Time Recovery | `BackupVerificationFailed`, `DataLossSuspected`, logical corruption, accidental mass deletion, quarterly drill | SEV-1 for real data loss; not an incident for a drill | 1–6 h |
| [RB-12](../runbooks/rb-12-region-failover.md) | Regional Failover | Confirmed extended failure of `africa-south1` | **SEV-1** | ~4 h |
| [RB-13](../runbooks/rb-13-service-down.md) | Service Unavailable or Crash Looping | `PlatformDown`, `Tier1ServiceDown`, `Tier1ErrorRateHigh`, `PodCrashLooping` | SEV-1 for a Tier 1 service or the platform; SEV-2 otherwise | 10–45 min |
| [RB-14](../runbooks/rb-14-security-incident.md) | Security Incident and Suspected Data Exposure | `CrossTenantAccessDetected`, `PIIRedactionFailure`, `AuditChainBroken`, `AuthFailureSpike`, `BulkExportAnomalous`, credential compromise, any suspected breach | **SEV-1** | Hours to days |
| [RB-15](../runbooks/rb-15-integration-failure.md) | External Integration Failure | `CircuitBreakerOpen`, `IntegrationErrorRateHigh`, `FXRateStale`, provider outage | SEV-3 generally; **SEV-2 for FX staleness or mobile money during a disbursement window** | 20–60 min |
| [RB-16](../runbooks/rb-16-sync-failure.md) | Field Sync Failure | `SyncFailureRateHigh`, `SyncVolumeAnomalous`, field officers reporting sync failures | **SEV-2, escalating to SEV-1 after 6 hours** | 30–120 min |

Two severity assignments are worth noticing because they run against intuition. **RB-04 certificate expiry is SEV-3 while the certificate is merely expiring and SEV-1 the moment it has expired** — the gap between those two states is the entire value of the alert. And **RB-15 integration failure is only SEV-3 in general**, because a queued email is an inconvenience, but rises to SEV-2 for a stale FX rate, because that one silently produces wrong financial figures rather than visibly failing.

---

## G.2 By entry point

### G.2.1 From an alert

Every alert resolves to exactly one runbook. The mapping is verified automatically; an alert pointing at a missing runbook fails the build ([28 §28.5.1](../28-operational-runbooks.md)).

| Alert | Runbook |
| --- | --- |
| `DatabaseUnavailable`, `ReplicationLagHigh` | [RB-03](../runbooks/rb-03-database-failover.md) |
| `PlatformDown`, `Tier1ServiceDown`, `Tier1ErrorRateHigh`, `PodCrashLooping` | [RB-13](../runbooks/rb-13-service-down.md) |
| `LatencyHigh`, `DatabaseConnectionsHigh`, `DatabasePoolWaitHigh`, `RedisMemoryHigh`, `RedisEvictionsOccurring`, `NotificationBacklog`, `DiskGrowthAnomalous` | [RB-08](../runbooks/rb-08-scale-event.md) |
| `EventsDeadLettered`, `EventConsumerLagCritical`, `OutboxRelayStalled` | [RB-02](../runbooks/rb-02-dlq-drain-and-replay.md) |
| `SyncFailureRateHigh`, `SyncVolumeAnomalous` | [RB-16](../runbooks/rb-16-sync-failure.md) |
| `PayrollRunFailed`, `PayrollRunStalled` | [RB-01](../runbooks/rb-01-failed-payroll-run.md) |
| `CircuitBreakerOpen`, `IntegrationErrorRateHigh`, `FXRateStale` | [RB-15](../runbooks/rb-15-integration-failure.md) |
| `CertificateExpiringSoon` | [RB-04](../runbooks/rb-04-certificate-rotation.md) |
| `BackupVerificationFailed`, `DataLossSuspected` | [RB-11](../runbooks/rb-11-backup-restore-drill.md) |
| **`CrossTenantAccessDetected`** | **[RB-14](../runbooks/rb-14-security-incident.md)** |
| **`PIIRedactionFailure`** | **[RB-14](../runbooks/rb-14-security-incident.md)** |
| **`AuditChainBroken`** | **[RB-14](../runbooks/rb-14-security-incident.md)** |
| `AuthFailureSpike`, `BulkExportAnomalous`, `PIIAccessAnomalous` | [RB-14](../runbooks/rb-14-security-incident.md) |
| `BreakGlassActivated` | Informational; reviewed under [15 §15.6](../15-rbac-and-authorization.md) |
| `SecretRotationOverdue` | [RB-09](../runbooks/rb-09-secret-rotation.md) |
| `SLOFastBurn`, `SLOSlowBurn` | The runbook for the affected service; error budget policy in [24 §24.8](../24-observability.md) |
| `AICostAnomalous` | [RB-15 §5.7](../runbooks/rb-15-integration-failure.md) |
| `MetricCardinalityHigh` | [24 §24.11](../24-observability.md) |
| `TenantQuotaExceeded` | [RB-08](../runbooks/rb-08-scale-event.md) |

`CrossTenantAccessDetected` fires on `ngois_db_rls_context_missing_total > 0` **or** on the production isolation canary failing, and `PIIRedactionFailure` on `ngois_ai_redaction_failures_total > 0` ([24 §24.7](../24-observability.md)). All three of the bold alerts route to [RB-14](../runbooks/rb-14-security-incident.md) rather than to a diagnostic runbook, because its governing instruction is **declare first, investigate second**. Treating a canary failure as a debugging exercise loses the containment window.

### G.2.2 From a planned activity

| Activity | Runbook |
| --- | --- |
| New tenant | [RB-05](../runbooks/rb-05-tenant-onboarding.md) |
| Tenant leaving | [RB-06](../runbooks/rb-06-tenant-offboarding.md) |
| Erasure request | [RB-07](../runbooks/rb-07-pii-erasure-request.md) |
| Scheduled secret rotation | [RB-09](../runbooks/rb-09-secret-rotation.md) |
| Certificate renewal | [RB-04](../runbooks/rb-04-certificate-rotation.md) |
| Quarterly restore drill | [RB-11](../runbooks/rb-11-backup-restore-drill.md) |
| Quarterly failover drill | [RB-12](../runbooks/rb-12-region-failover.md) |
| Pre-scaling for a known peak | [RB-08 §5.7](../runbooks/rb-08-scale-event.md) |

### G.2.3 From a tenant report

| Report | Start here |
| --- | --- |
| "Sync is not working" | [RB-16](../runbooks/rb-16-sync-failure.md) |
| "Payroll will not complete" | [RB-01](../runbooks/rb-01-failed-payroll-run.md) |
| "The platform is slow" | [RB-08](../runbooks/rb-08-scale-event.md) |
| "The platform is down" | [RB-13](../runbooks/rb-13-service-down.md) |
| "Data is missing" | [RB-16 §6.5](../runbooks/rb-16-sync-failure.md), then [RB-02](../runbooks/rb-02-dlq-drain-and-replay.md), then [RB-11](../runbooks/rb-11-backup-restore-drill.md) |
| **"I can see data that is not ours"** | **[RB-14](../runbooks/rb-14-security-incident.md) immediately** |
| "A payment went out twice" | [RB-15 §5.3](../runbooks/rb-15-integration-failure.md) |
| "Our figures look wrong" | [RB-15 §5.5](../runbooks/rb-15-integration-failure.md) for FX; otherwise [RB-01](../runbooks/rb-01-failed-payroll-run.md) |

---

## G.3 Verification status

A runbook's value is its accuracy, and an unverified runbook is a document rather than a procedure. Each date below is copied from the runbook's own **Last verified** field. The next-due column applies the governance cadence of [28 §28.5](../28-operational-runbooks.md) — a rotating quarterly programme sized so that every runbook is executed at least annually — except for RB-11 and RB-12, which are drilled quarterly under [27 §27.9](../27-disaster-recovery-and-bcp.md).

| Runbook | Last verified | How | Next due |
| --- | --- | --- | --- |
| RB-01 | 2026-05-14 | Staging, seeded run failures | 2027-05 |
| RB-02 | 2026-06-03 | Staging, injected poison event | 2027-06 |
| RB-03 | 2026-04-22 | Staging, forced failover | 2027-04 |
| RB-04 | **2026-03-18** | Staging | **2027-03, and the oldest in the set — see below** |
| RB-05 | 2026-06-09 | Staging, synthetic tenant | Continuous in use |
| RB-06 | 2026-05-27 | Staging, synthetic tenant | 2027-05 |
| RB-07 | 2026-04-30 | Staging, full erasure and restore replay | 2027-04 |
| RB-08 | 2026-05-06 | Staging load test | 2027-05 |
| RB-09 | 2026-06-11 | Staging | 2027-06 |
| RB-10 | 2026-05-20 | Staging, gate verification | Continuous in use |
| RB-11 | 2026-06-15 | **Quarterly drill** | 2026-09 |
| RB-12 | 2026-06-15 | **Quarterly drill in staging, 3 h 41 m** | 2026-09 |
| RB-13 | 2026-06-02 | Staging, chaos experiments CH-1 to CH-4 | 2027-06 |
| RB-14 | 2026-04-15 | **Tabletop exercise** | 2027-04 |
| RB-15 | 2026-05-13 | Staging with fault injection | 2027-05 |
| RB-16 | 2026-05-28 | Staging with the offline harness | 2027-05 |

Three observations this table is meant to surface rather than hide.

**RB-04 has the oldest verification in the set,** at 2026-03-18. It also happens to govern the failure mode with the sharpest severity cliff (§G.1): fine one hour, total outage the next. Certificate rotation is automated through cert-manager and therefore almost never exercised in anger, which is precisely why the drill carries weight and precisely why it is the one that slipped to the back of the rotation. Runbook drift is tracked as R-33 in [32](../32-risk-register.md).

**RB-11 and RB-12 were verified in the same drill.** The shared 2026-06-15 date is not a transcription error: the quarterly disaster-recovery drill exercises restore and regional failover as one continuous exercise. That is efficient, but it means the two procedures have never been independently timed, and the 3 h 41 m figure recorded for RB-12 includes restore time that RB-11 also counts as its own.

**RB-14 is verified by tabletop, not execution.** Rehearsing a real breach response end to end is not possible; the platform cannot practise notifying a regulator. That is a permanent limitation rather than a scheduling gap, and it is the reason the runbook front-loads declaration and containment ahead of investigation. The parts that cannot be rehearsed are the parts that must not require judgement under pressure.

---

## G.4 Properties every runbook has

| Property | Reason |
| --- | --- |
| A **do not** section before the procedure | The most damaging actions are usually the intuitive ones. Deleting a failed payroll run, restoring over the live primary, telling field officers to reinstall the app |
| Copy-pasteable commands with expected output | An operator should not be composing PromQL at 3 a.m. |
| Explicit decision points with a table | "If X, go to §6.3" rather than prose the reader must interpret |
| A verification section | Mitigation is not resolution |
| An escalation table | Named conditions and named people, so escalating is not a judgement call |
| A follow-up section | Including correcting the runbook itself the same day |
| **No assumed prior knowledge** | The person executing may not have written the code |

### G.4.1 The most consequential "do not" instructions

Collected here because they are the content most likely to prevent irreversible harm.

| Instruction | Runbook | Consequence of ignoring it |
| --- | --- | --- |
| **Do not tell field officers to clear app data, log out, or reinstall** | [RB-16](../runbooks/rb-16-sync-failure.md) | Destroys days of unsynced captured data. The most damaging well-meant support advice available ([32](../32-risk-register.md) R-17) |
| **Do not restore over the live primary** | [RB-11](../runbooks/rb-11-backup-restore-drill.md) | Turns a partial data problem into a total one |
| **Do not promote the replica before fencing the primary** | [RB-12](../runbooks/rb-12-region-failover.md) | Split brain, with divergent financial records |
| **Do not re-initiate a payment during an incident** | [RB-15](../runbooks/rb-15-integration-failure.md) | Duplicate disbursement of real money |
| **Do not delete a failed payroll run** | [RB-01](../runbooks/rb-01-failed-payroll-run.md) | Destroys the evidence needed to diagnose it, and the audit position |
| **Do not reboot before preserving evidence** | [RB-14](../runbooks/rb-14-security-incident.md) | Destroys the only record of what an attacker did |
| **Do not replay a dead-letter queue before fixing the cause** | [RB-02](../runbooks/rb-02-dlq-drain-and-replay.md) | Re-poisons the stream and hides the original failure |
| **Do not complete a failed provisioning job by hand** | [RB-05](../runbooks/rb-05-tenant-onboarding.md) | A tenant activated without full isolation ([32](../32-risk-register.md) R-35) |
| **Do not skip the non-negotiable CI gates for a hotfix** | [RB-10](../runbooks/rb-10-hotfix-deployment.md) | Ships an isolation or secret defect under time pressure |
| **Do not resolve sync conflicts on a tenant's behalf** | [RB-16](../runbooks/rb-16-sync-failure.md) | Makes programme decisions for an organisation that did not ask |

---

## G.5 The offline bundle

All sixteen runbooks are exported to PDF weekly and stored where they are reachable when the platform is not: in the incident management tool, in the platform team's password manager, and printed in the office.

This is not excessive caution. The observability stack is self-hosted and shares failure domains with what it observes ([ADR-0017](../adr/0017-self-hosted-observability-stack.md)), so a cluster-wide failure can remove access to the dashboards *and* to any runbook hosted alongside them. [RB-12](../runbooks/rb-12-region-failover.md) in particular must be executable when the primary region is gone.
