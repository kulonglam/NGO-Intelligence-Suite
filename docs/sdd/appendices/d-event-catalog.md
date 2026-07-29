# Appendix D — Event Catalog

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Owner:** Chief Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Source of truth:** [11](../11-event-driven-architecture.md) holds the envelope specification, the JSON payload schemas and the versioning rules. This appendix is the flat reference index: every event, its stream, its producer, its consumers, and the notes that matter operationally.

---

## D.1 Conventions

Event names are `domain.entity.action` in the past tense, because an event is a statement of fact about something that has already happened. `grant.disbursement.approved`, never `grant.disbursement.approve`.

| Column | Meaning |
| --- | --- |
| **v** | Current schema version |
| **Payload** | Key fields beyond the standard envelope |
| **Consumers** | Subscribing services by short name |

Consumer short names map to: `audit` → `audit-service`, `notif` → `notification-service`, `analytics` → `analytics-service`, `hr` → `hr-payroll-service`, `lms` → `lms-service`, `grant` → `grant-service`, `ben` → `beneficiary-service`, `field` → `field-data-service`, `report` → `reporting-service`, `integ` → `integration-service`, `auth` → `auth-service`, `file` → `file-service`, `tenant` → `tenant-service`.

### D.1.1 Rules that apply to every event

| Rule | Detail |
| --- | --- |
| **Delivery** | At-least-once. **Every consumer must be idempotent on `event_id`** ([ADR-0011](../adr/0011-transactional-outbox.md)) |
| **Publication** | Through the transactional outbox only. No service calls Redis directly |
| **Ordering** | Per-stream, by outbox insertion order. **Never assume ordering between streams or between entities** |
| **Payload contents** | Identifiers and metadata. **No personal data beyond identifiers** — a consumer needing detail fetches it through the authenticated API, so the access is governed and audited |
| **Compatibility** | A consumer written against version N must tolerate N+1. Additive changes only within a major version ([11 §11.8](../11-event-driven-architecture.md)) |
| **Failure** | 5 attempts with exponential backoff, then the per-group dead-letter stream ([RB-02](../runbooks/rb-02-dlq-drain-and-replay.md)) |
| **Correlation** | `correlation_id` and `causation_id` are set at the source of truth and propagated |

---

## D.2 `identity.events` — producer `auth-service`

Volume ~2,000/day. Stream capped at 1,000,000.

| Event | v | Payload | Consumers | Notes |
| --- | --- | --- | --- | --- |
| `identity.user.created` | 1 | `user_id`, `email_hash`, `invited_by` | audit, notif, hr | Links a platform user to an employee record where one exists |
| `identity.user.invited` | 1 | `user_id`, `invitation_expires_at` | audit, notif | |
| `identity.user.activated` | 1 | `user_id`, `activated_at` | audit, analytics | |
| `identity.user.suspended` | 1 | `user_id`, `reason` | audit, notif | |
| `identity.user.deleted` | 1 | `user_id`, `deactivated_at` | audit, hr, lms | Deactivation, not erasure. The employee record persists |
| `identity.role.assigned` | 1 | `user_id`, `role`, `scope_type`, `scope_ids` | audit, notif | **Invalidates the permission cache immediately**, not on TTL expiry |
| `identity.role.revoked` | 1 | `user_id`, `role` | audit, notif | Same |
| `identity.login.succeeded` | 1 | `user_id`, `ip_hash`, `device_id` | audit, analytics | |
| `identity.login.failed` | 1 | `email_hash`, `ip_hash`, `reason` | audit | Feeds lockout and anomaly detection. **Email is hashed** |
| `identity.mfa.enrolled` | 1 | `user_id`, `method` | audit | |
| `identity.session.revoked` | 1 | `session_id`, `user_id`, `reason` | audit | Emitted on role change, suspension, or incident response |
| `identity.breakglass.granted` | 1 | `actor_id`, `ticket`, `scope`, `expires_at` | audit, notif | **Always alerts.** Emergency access is never silent ([15 §15.6](../15-rbac-and-authorization.md)) |

---

## D.3 `platform.events` — producers `tenant-service`, `file-service`, `reporting-service`, `integration-service`, scheduled jobs

Volume ~1,000/day. The broadest stream, because it carries both tenant lifecycle and scheduled platform activity.

| Event | v | Payload | Consumers | Notes |
| --- | --- | --- | --- | --- |
| `tenant.provisioned` | 1 | `tenant_id`, `slug`, `modules`, `payroll_schema` | audit, auth, hr, lms, notif | **Triggers per-service tenant initialisation.** Consumers must be idempotent because provisioning is re-runnable ([RB-05](../runbooks/rb-05-tenant-onboarding.md)) |
| `tenant.settings.updated` | 1 | `tenant_id`, `changed_keys`, `before`, `after` | audit, notif | Values, not just keys, because a security setting change must be reconstructible |
| `tenant.quota.warning` | 1 | `tenant_id`, `quota`, `used`, `limit` | notif | At 80 per cent |
| `tenant.quota.exceeded` | 1 | `tenant_id`, `quota`, `used`, `limit` | audit, notif | |
| `tenant.suspended` | 1 | `tenant_id`, `reason`, `read_only` | audit, auth, notif | **`read_only` distinguishes a commercial suspension from a security one** ([29 §29.7.1](../29-multi-tenancy-and-tenant-lifecycle.md)) |
| `tenant.reactivated` | 1 | `tenant_id`, `reactivated_at` | audit, auth, notif | Restores write access. `auth` re-enables sessions |
| `tenant.config.updated` | 1 | `tenant_id`, `changed_keys` | audit, all services | **Invalidates the configuration cache immediately** rather than waiting for the 60-second TTL ([20 §20.3](../20-configuration-secrets-feature-flags.md)) |
| `tenant.offboarding.started` | 1 | `tenant_id`, `export_deadline`, `deletion_date` | audit, all domain services | Every domain service begins its export contribution |
| `tenant.data.exported` | 1 | `tenant_id`, `export_id`, `scope`, `checksum` | audit, notif | The **full tenant** export, distinct from a report export ([29 §29.8](../29-multi-tenancy-and-tenant-lifecycle.md)) |
| `tenant.personal_data_deleted` | 1 | `tenant_id`, `records_tombstoned`, `files_deleted` | audit, ben, field, file, lms | **Downstream services purge derived copies.** Emitted at the personal-data phase of offboarding, before final deletion ([RB-06 §5.4](../runbooks/rb-06-tenant-offboarding.md)) |
| `tenant.deleted` | 1 | `tenant_id`, `deletion_certificate_id` | audit | Personal data gone; de-identified records retained |
| `platform.file.uploaded` | 1 | `file_id`, `size`, `mime_type`, `linked_resource` | audit | |
| `platform.file.scan.failed` | 1 | `file_id`, `verdict` | audit, notif | **File is not downloadable** until scanned clean |
| `platform.report.completed` | 1 | `report_id`, `definition`, `duration_ms`, `row_count` | notif | |
| `platform.payslip.generated` | 1 | `payslip_id`, `employee_id`, `period` | notif | Payload carries no amounts |
| `platform.export.completed` | 1 | `export_id`, `scope`, `signed_url_expires_at` | audit, notif | **Audited because an export is the most sensitive artefact produced** ([29 §29.8](../29-multi-tenancy-and-tenant-lifecycle.md)) |
| `platform.integration.failed` | 1 | `provider`, `operation`, `error_class`, `circuit_state` | notif | Feeds `CircuitBreakerOpen` ([RB-15](../runbooks/rb-15-integration-failure.md)) |
| `platform.flag.changed` | 1 | `flag`, `scope`, `from`, `to`, `changed_by` | audit, all services | **A kill-switch change invalidates caches immediately**, because 60 seconds is too long during an incident ([20 §20.5.3](../20-configuration-secrets-feature-flags.md)) |
| `platform.day.rolled` | 1 | `date`, `tenant_id` | grant, lms, hr, ben | **The scheduled tick.** Drives overdue checks, expiry warnings, accrual and recalculation. Consumers must tolerate a duplicate tick |
| `platform.fx.updated` | 1 | `rate_date`, `pairs_updated`, `source` | grant, hr, analytics | Daily at 06:00 UTC. **Absence for 7 days blocks payroll** with `NGOIS-PAY-0117` |
| `platform.iati.published` | 1 | `activity_ids`, `registry_response`, `published_at` | audit, grant, notif | Weekly. Audited because publication is public and permanent |
| `platform.retention.applied` | 1 | `policy`, `records_affected`, `tenant_id` | audit | Daily. **The evidence that storage limitation is enforced** ([Appendix H §H.2](h-compliance-traceability.md), Art. 5(1)(e)) |
| `platform.reconciliation.completed` | 1 | `checks_run`, `discrepancies`, `detail` | audit, notif | Nightly. A non-zero discrepancy count alerts ([09 §9.10](../09-data-management-strategy.md)) |
| `platform.audit.verified` | 1 | `tenant_id`, `sequence_checked`, `chain_valid` | audit, notif | Nightly hash-chain verification. **`chain_valid = false` is a SEV-1** ([RB-14](../runbooks/rb-14-security-incident.md)) |

---

## D.4 `grant.events` — producer `grant-service`

Volume ~500/day.

| Event | v | Payload | Consumers | Notes |
| --- | --- | --- | --- | --- |
| `grant.created` | 1 | `grant_id`, `donor_id`, `total_amount`, `currency`, `start_date`, `end_date` | audit, analytics, integ | `integ` stages IATI where publication is enabled |
| `grant.updated` | 1 | `grant_id`, `changed_fields` | audit, analytics | |
| `grant.status.changed` | 2 | `grant_id`, `from_status`, `to_status`, `reason` | audit, analytics, notif, ben | **v2 added `reason`.** v1 consumers ignore it |
| `grant.budget.revised` | 1 | `grant_id`, `budget_id`, `revision`, `total`, `approved_by` | audit, analytics, notif | |
| `grant.disbursement.recorded` | 1 | `disbursement_id`, `grant_id`, `amount`, `currency`, `prepared_by` | audit, notif, analytics | Recorded, **not** yet approved |
| `grant.disbursement.approved` | 1 | `disbursement_id`, `amount`, `approved_by`, `prepared_by` | audit, notif, analytics | **Both parties in the payload**, so maker-checker compliance is provable from the event stream alone |
| `grant.ceiling.approached` | 1 | `grant_id`, `committed`, `ceiling`, `percentage` | notif, analytics | At 90 per cent |
| `grant.report.submitted` | 1 | `report_id`, `grant_id`, `period`, `submitted_by`, `ai_assisted` | audit, analytics, notif | **`ai_assisted` provides internal traceability** ([ADR-0010](../adr/0010-llm-provider-and-boundaries.md)) |
| `grant.report.overdue` | 1 | `report_id`, `grant_id`, `days_overdue` | notif, analytics | From `platform.day.rolled` |
| `grant.expiring.soon` | 1 | `grant_id`, `end_date`, `days_remaining` | notif, analytics | 90, 60, 30 days |
| `grant.compliance.recalculated` | 1 | `grant_id`, `score`, `previous_score`, `factors` | analytics | Factors included so a change is explainable ([Appendix I §I.4](i-algorithms.md)) |
| `grant.activity.created` | 1 | `activity_id`, `grant_id`, `programme_id` | field, analytics | Lets field data link submissions to a grant |
| `grant.closed` | 1 | `grant_id`, `closed_at`, `final_expenditure` | audit, notif, analytics, ben | `ben` exits associated programme enrolments |

---

## D.5 `hr.events` — producer `hr-payroll-service`

Volume ~300/day, spiking monthly.

| Event | v | Payload | Consumers | Notes |
| --- | --- | --- | --- | --- |
| `hr.employee.created` | 1 | `employee_id`, `employee_number`, `department_id` | audit | **No name in the payload** |
| `hr.employee.onboarded` | 1 | `employee_id`, `position_id`, `hire_date`, `user_id` | audit, auth, lms, notif, analytics | **`lms` triggers mandatory training enrolment.** The canonical cross-domain workflow ([05](../05-architecture-diagrams.md)) |
| `hr.employee.status.changed` | 1 | `employee_id`, `from_status`, `to_status` | audit, lms, analytics | |
| `hr.employee.terminated` | 1 | `employee_id`, `termination_date`, `user_id` | audit, **auth (urgent)**, lms, notif | **Consumed at elevated priority by `auth`** to revoke access. A delay here is a security exposure, so this consumer group is monitored separately |
| `hr.contract.created` | 1 | `contract_id`, `employee_id`, `start_date`, `end_date` | audit, notif | **No salary in the payload** |
| `hr.contract.expiring` | 1 | `contract_id`, `employee_id`, `days_remaining` | notif | |
| `hr.leave.requested` | 1 | `request_id`, `employee_id`, `leave_type`, `days` | notif | |
| `hr.leave.approved` | 1 | `request_id`, `employee_id`, `days`, `approved_by` | audit, notif, analytics | |
| `hr.leave.rejected` | 1 | `request_id`, `reason` | notif | |
| `hr.payroll_run.created` | 1 | `run_id`, `period_year`, `period_month`, `ruleset_hash` | audit | |
| `hr.payroll_run.submitted` | 1 | `run_id`, `submitted_by`, `employee_count` | audit, notif | Notifies approvers |
| `hr.payroll_run.approved` | 2 | `run_id`, `approved_by`, `prepared_by`, `total_net`, `currency`, `ruleset_hash` | audit, report, grant, analytics, notif | **v2 added `ruleset_hash`** for reproducibility. `report` generates payslips; `grant` applies cost allocations |
| `hr.payroll_run.reversed` | 1 | `run_id`, `reversal_run_id`, `reason`, `authorised_by` | audit, report, grant, notif | A reversal is a new run; the original is never mutated |
| `hr.statutory_rules.updated` | 1 | `country_code`, `effective_from`, `ruleset_hash`, `source_reference` | audit, notif | **`source_reference` is the statutory citation.** Cannot alter a historical run |

---

## D.6 `beneficiary.events` — producer `beneficiary-service`

Volume ~3,000/day, campaign spikes to 50,000. Stream capped at 5,000,000.

| Event | v | Payload | Consumers | Notes |
| --- | --- | --- | --- | --- |
| `beneficiary.registered` | 1 | `beneficiary_id`, `beneficiary_code`, `household_id`, `admin_area_id`, `source` | audit, analytics | **`beneficiary_code` and coarse area only. No name, no precise location** — the payload rule matters most in this stream |
| `beneficiary.updated` | 1 | `beneficiary_id`, `changed_fields` | audit, analytics | Field names, never values |
| `beneficiary.merged` | 1 | `surviving_id`, `merged_id`, `decided_by`, `rationale` | audit, field, analytics | **`decided_by` is always a person.** Never automatic ([13 §13.6](../13-offline-first-architecture.md)) |
| `beneficiary.erased` | 1 | `beneficiary_id`, `erasure_request_id`, `approved_by`, `scope` | audit, field, file, analytics | **`file` deletes associated attachments; `field` tombstones submission values.** The fan-out that makes erasure complete ([RB-07](../runbooks/rb-07-pii-erasure-request.md)) |
| `beneficiary.duplicate.flagged` | 1 | `candidate_ids`, `match_score`, `matched_attributes` | notif | Routed to the tenant for review |
| `beneficiary.vulnerability.recalculated` | 1 | `beneficiary_id`, `score`, `previous_score`, `model_version` | analytics | **Advisory only.** No consumer may act on it to alter eligibility ([ADR-0010](../adr/0010-llm-provider-and-boundaries.md), AI-3) |
| `beneficiary.pii.accessed` | 1 | `beneficiary_id`, `actor_id`, `fields`, `purpose` | audit | **The purpose-logging event.** A read without a purpose is rejected before this is emitted ([17 §17.6](../17-privacy-and-compliance.md)) |
| `programme.enrollment.created` | 1 | `enrollment_id`, `programme_id`, `beneficiary_id` | audit, analytics | |
| `programme.enrollment.exited` | 1 | `enrollment_id`, `exit_reason`, `exited_at` | audit, analytics | |
| `programme.attendance.recorded` | 1 | `record_id`, `activity_id`, `beneficiary_id`, `client_uuid` | audit, analytics, grant | Highest-volume event in this stream. `grant` updates reach figures |

---

## D.7 `fielddata.events` — producer `field-data-service`

Volume ~5,000/day, sync spikes to 100,000. Stream capped at 5,000,000. **The stream most likely to cause Redis memory pressure** ([RB-02 §5.5](../runbooks/rb-02-dlq-drain-and-replay.md)).

| Event | v | Payload | Consumers | Notes |
| --- | --- | --- | --- | --- |
| `fielddata.form.published` | 1 | `template_id`, `version`, `published_by` | audit, notif | Devices fetch the new version on next sync. **Does not invalidate existing submissions** |
| `fielddata.submission.received` | 1 | `submission_id`, `client_uuid`, `form_version_id`, `captured_at`, `received_at` | analytics | Emitted after the durable commit |
| `fielddata.submission.accepted` | 1 | `submission_id`, `beneficiary_id`, `form_version_id` | audit, ben, analytics | `ben` applies field-authoritative attribute updates ([ADR-0005](../adr/0005-offline-conflict-resolution-policy.md)) |
| `fielddata.submission.rejected` | 1 | `submission_id`, `reason`, `error_code` | notif, analytics | A rejection due to form republication is a **defect**, not a normal case ([RB-16 §6.3](../runbooks/rb-16-sync-failure.md)) |
| `fielddata.submission.flagged` | 1 | `submission_id`, `flag_type`, `detail` | notif | Probable duplicate or validation concern. **Flagged, never dropped** |
| `fielddata.submission.linked` | 1 | `submission_id`, `activity_id`, `grant_id` | grant, analytics | |
| `fielddata.sync.completed` | 1 | `session_id`, `device_id`, `submission_count`, `duration_ms`, `bytes`, `clock_offset_seconds` | analytics | Source of the sync SLO and of the queue-age metric |
| `fielddata.sync.conflict` | 1 | `entity_type`, `entity_id`, `policy`, `resolution` | notif | Where `resolution` is `pending_review`, **only the tenant may resolve it** |

---

## D.8 `lms.events` — producer `lms-service`

Volume ~800/day.

| Event | v | Payload | Consumers | Notes |
| --- | --- | --- | --- | --- |
| `lms.course.published` | 1 | `course_id`, `version`, `mandatory_for` | audit, notif | |
| `lms.enrollment.created` | 1 | `enrollment_id`, `user_id`, `course_id`, `due_date`, `source` | audit, notif | `source` distinguishes automatic from manual enrolment |
| `lms.enrollment.started` | 1 | `enrollment_id`, `started_at` | analytics | |
| `lms.enrollment.completed` | 1 | `enrollment_id`, `user_id`, `course_id`, `completed_at`, `score` | audit, hr, report, analytics | **`hr` updates training compliance** — the return leg of the onboarding workflow |
| `lms.enrollment.overdue` | 1 | `enrollment_id`, `days_overdue` | notif, analytics | Matters for PSEA compliance |
| `lms.assessment.passed` | 1 | `attempt_id`, `assessment_id`, `score` | analytics | |
| `lms.assessment.failed` | 1 | `attempt_id`, `score`, `attempts_remaining` | analytics | |
| `lms.certificate.issued` | 1 | `certificate_id`, `number`, `verification_hash`, `expires_at` | audit, notif, report | The hash permits third-party verification without platform access |

---

## D.9 Publisher and subscriber summary

| Service | Publishes | Subscribes to |
| --- | --- | --- |
| `auth-service` | 12 | `platform.events` (tenant provisioning, suspension, reactivation), `hr.events` (termination, **urgent**) |
| `tenant-service` | 12 | — |
| `grant-service` | 13 | `hr.events` (payroll cost allocation), `fielddata.events` (activity linkage), `beneficiary.events` (attendance for reach) |
| `hr-payroll-service` | 14 | `identity.events` (user creation), `platform.events` (tenant, day roll) |
| `beneficiary-service` | 10 | `fielddata.events` (accepted submissions), `grant.events` (status, closure), `platform.events` |
| `field-data-service` | 8 | `beneficiary.events` (merge, erasure), `grant.events` (activity created) |
| `lms-service` | 8 | `hr.events` (onboarding, termination, status), `platform.events` |
| `notification-service` | — | **All seven streams** |
| `audit-service` | — | **All seven streams** |
| `analytics-service` | — | All seven streams |
| `reporting-service` | 3 | `hr.events` (payroll approved), `lms.events` (certificates) |
| `integration-service` | 2 | `grant.events` (IATI staging) |
| `file-service` | 2 | `beneficiary.events` (erasure), `platform.events` (tenant deletion) |
| Scheduled jobs | 5 | — |

### D.9.1 Totals

| | Count |
| --- | --- |
| Events in the catalogue | **89** |
| Streams | 7 |
| Producing services, plus the scheduler | 11 |
| Consuming services | 12 |
| Events consumed by `audit-service` | 89 — **every event is audited** |
| Events with a version above 1 | 2 — `grant.status.changed`, `hr.payroll_run.approved` |
| Events carrying any personal data | **0** |

The last two rows are the ones worth checking on any change. Two schema versions above 1 in a catalogue of 89 suggests the additive-only discipline is holding, and both increments added a field rather than changing one: `reason` on `grant.status.changed`, and `ruleset_hash` on `hr.payroll_run.approved`. A v1 consumer of either still works, which is the whole point of the compatibility rule in §D.2. Zero events carrying personal data is a hard invariant, asserted by a test that inspects payload schemas against the classification inventory ([Appendix B §B.9](b-data-dictionary.md)) — an event schema introducing a restricted field fails the build.

Per-stream counts: `identity.events` 12, `platform.events` 24, `grant.events` 13, `hr.events` 14, `beneficiary.events` 10, `fielddata.events` 8, `lms.events` 8.

---

## D.10 Operational notes by stream

| Stream | Trim | Watch for | Runbook |
| --- | --- | --- | --- |
| `identity.events` | 1 M | `breakglass.granted` volume; failed-login patterns | [RB-14](../runbooks/rb-14-security-incident.md) |
| `platform.events` | 1 M | A missed `day.rolled` tick, which silently stops overdue detection | [RB-02](../runbooks/rb-02-dlq-drain-and-replay.md) |
| `grant.events` | 1 M | Approval events without a matching audit entry | [RB-02](../runbooks/rb-02-dlq-drain-and-replay.md) |
| `hr.events` | 1 M | **`employee.terminated` consumer lag** — an access-revocation delay | [RB-13](../runbooks/rb-13-service-down.md) |
| `beneficiary.events` | 5 M | Registration campaign spikes; `erased` fan-out completion | [RB-07](../runbooks/rb-07-pii-erasure-request.md) |
| `fielddata.events` | 5 M | **Sync storms; the largest memory-pressure risk** | [RB-16](../runbooks/rb-16-sync-failure.md), [RB-02](../runbooks/rb-02-dlq-drain-and-replay.md) |
| `lms.events` | 1 M | Induction bursts | — |

Two consumer groups are monitored individually rather than in aggregate, because lag in them has a consequence beyond staleness: `auth-service` on `hr.employee.terminated`, where lag means a terminated employee retains access, and `file-service` on `beneficiary.erased`, where lag means an erasure is incomplete past its deadline.
