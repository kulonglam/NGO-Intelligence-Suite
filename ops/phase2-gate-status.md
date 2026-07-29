# Phase 2 gate status (SDD §31.4.2)

> Workforce / payroll phase. **BLOCKED** gates need load tests, accountant sign-off, or full tenant onboarding at scale.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | 100% payroll fixture corpus (SS + UG edge cases) | PASS (local) | `npm run test:payroll-fixtures` — Appendix I + I.6.6 full edge corpus |
| 2 | Recompute same ruleset hash → byte-identical | PASS (local) | `npm run test:payroll-fixtures` reproducibility test |
| 3 | Separation of duties cannot be circumvented | PASS (local) | DB `payroll_runs_approver_differs` + RBAC matrix invariant |
| 4 | 500 employees / 5 min, no p95 degradation | BLOCKED | Needs load harness at scale |
| 5 | Interrupted run leaves no partial state | PASS (local partial) | Per-employee transactional compute + delete-before-recompute |
| 6 | Ruleset changes auditable; history immutable | PASS (local) | `ruleset_hash` on run; approved status terminal |
| 7 | Erasure end-to-end + restore replay | BLOCKED | Phase 2 compliance workstream |
| 8 | Payroll schema isolation (`svc_hr_payroll` only) | PASS (local) | ADR-0006 per-tenant schema + `provision_tenant_payroll_schema` |
| 9 | FX staleness → visible warning/block | PASS (local) | `NGOIS-PAY-0117` on stale FX at run create |
| 10 | Canary aborts on injected regression | BLOCKED | Production canary (Phase 2 platform) |
| 11 | Quotas under load | BLOCKED | Platform quotas not implemented |
| 12 | Eight tenants RB-05 no manual steps | BLOCKED | Only 2 design partners seeded |
| 13 | Independent accountant review per jurisdiction | BLOCKED | External — not an engineering gate |

```powershell
npm run test:payroll-fixtures
npm run verify:phase2-gates
```
