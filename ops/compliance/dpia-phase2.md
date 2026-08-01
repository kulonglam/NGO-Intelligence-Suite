# Phase 2 DPIA — Workforce / Payroll (DPO-approved)

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Scope | Employees, contracts, leave, payroll, FX, expenses, reports, erasure/DSAR |
| Controller | Tenant NGO (design-partner and subsequent tenants) |
| Processor | NGO Intelligence Suite platform operator |
| Status | **Approved** — see `ops/compliance/dpia-attestation.json` |
| Lawful bases | Employment contract; legal obligation (tax/social security); legitimate interest (grant accountability) |

## Processing purposes

1. Statutory payroll calculation and payment preparation (SS, UG)
2. Leave accrual and approval
3. Grant-linked expense recording and budget vs actual reporting
4. Data subject access (DSAR) and erasure fulfilment

## Data categories

| Category | Sensitivity | Storage |
| --- | --- | --- |
| Employee identity / names | High | Encrypted at rest (per-tenant key) |
| Payroll amounts & deductions | High | Per-tenant payroll schema |
| Leave balances / requests | Medium | Shared schema + RLS |
| Bank / payment refs (if present) | High | Encrypted / purpose-limited |
| Audit events | High (integrity) | Append-only hash chain — never hard-deleted |

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Residual |
| --- | --- | --- | --- | --- |
| Cross-tenant leakage | Low | Critical | FORCE RLS; isolation suite; gateway strips forged tenant headers | Low |
| Payroll miscalculation | Medium | High | Fixture corpus; maker-checker; accountant review pack | Low |
| Incomplete erasure | Low | High | Erasure workflow + log; restore-replay disclosure | Low |
| Stale FX silent calc | Medium | Medium | NGOIS-PAY-0117 block; BvA fx_stale flag | Low |
| Over-retention of files | Medium | Medium | Retention sweep (dry-run default); legal holds | Low |

## Sub-processors (platform)

| Sub-processor | Role | Notes |
| --- | --- | --- |
| Cloud SQL / Postgres host | Database | Encrypted disks; PITR |
| Object storage (file-service) | Documents | Tenant-prefixed paths |
| Observability stack | Metrics/logs | PII scrubbing on log pipelines |

## Retention

See [`retention-schedule.md`](retention-schedule.md). Audit trail retained beyond operational PII soft-delete.

## Data subject rights

| Right | Mechanism |
| --- | --- |
| Access | `POST /v1/tenant/dsar-requests` |
| Erasure | `POST /v1/tenant/erasure-requests` → approve → execute (tombstone; no audit hard-delete) |
| Objection / restrict | Legal hold + status workflows (ops) |

## Checklist (completed)

- [x] DPO reviewed
- [x] Lawful basis documented per jurisdiction (SS, UG employment + tax)
- [x] Retention periods mapped
- [x] Sub-processor list current
- [x] Erasure + DSAR paths verified (`drill:erasure`)
- [x] Security controls traced to RLS / encryption / maker-checker

## Approval

Digital attestation recorded in `dpia-attestation.json` by the platform DPO role for the Phase 2 workforce scope. Tenant DPOs may require additional countersignature under their own policy before production payroll go-live.
