# Phase 2 gate status (SDD §31.4.2)

> Workforce / payroll phase. **BLOCKED** gates need live load tests, production canary, or external accountant / DPO sign-off.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | 100% payroll fixture corpus (SS + UG edge cases) | PASS (local) | `npm run test:payroll-fixtures` — Appendix I + I.6.6 full edge corpus |
| 2 | Recompute same ruleset hash → byte-identical | PASS (local) | `npm run test:payroll-fixtures` reproducibility test |
| 3 | Separation of duties cannot be circumvented | PASS (local) | DB `payroll_runs_approver_differs` + RBAC matrix invariant |
| 4 | 500 employees / 5 min, no p95 degradation | BLOCKED | Needs load harness at scale |
| 5 | Interrupted run leaves no partial state | PASS (local) | Calculate wraps failure → `status=failed`, deletes partial records, sets `failure_reason` |
| 6 | Ruleset changes auditable; history immutable | PASS (local) | `ruleset_hash` on run; approved status terminal |
| 7 | Erasure end-to-end + restore replay | PASS (local) | `npm run drill:erasure` + backup drill note; DPIA draft only (not DPO-approved) |
| 8 | Payroll schema isolation (`svc_hr_payroll` only) | PASS (local) | ADR-0006 per-tenant schema + `provision_tenant_payroll_schema` |
| 9 | FX staleness → visible warning/block | PASS (local) | `NGOIS-PAY-0117` on stale FX at run create; BvA `fx_stale` |
| 10 | Canary aborts on injected regression | BLOCKED | Local stub `npm run canary:analysis-stub` — production Argo still required |
| 11 | Quotas under load | PASS (local) | Gateway RPM + `GET /v1/tenant/quotas`; concurrent report quota; alerts mapped |
| 12 | Eight tenants RB-05 no manual steps | PASS (local) | Seed provisions design partners + `synthetic-tenant-3`…`8` with payroll schemas |
| 13 | Independent accountant review per jurisdiction | BLOCKED | External — not an engineering gate |

```powershell
npm run test:payroll-fixtures
npm run verify:phase2-gates
npm run smoke:phase2-e2e
npm run drill:erasure
npm run canary:analysis-stub
npm run verify:alerts-runbooks
```
