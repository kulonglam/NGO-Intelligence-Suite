# Phase 2 DPIA draft (workforce / payroll) — NOT DPO-approved

| Field | Value |
| --- | --- |
| Version | 0.1 draft |
| Scope | Employees, contracts, leave, payroll, FX, expenses, reports |
| Controller | Tenant NGO |
| Processor | NGO Intelligence Suite operator |
| Status | **Draft — awaiting DPO approval** |

## Data categories

- Employee identity (encrypted at rest)
- Payroll amounts and statutory deductions
- Leave balances and requests
- Financial expenses linked to grants

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Cross-tenant leakage | RLS + FORCE RLS; isolation suite |
| Payroll miscalculation | Fixture corpus; maker-checker; accountant review (external) |
| Erasure incomplete | Erasure workflow + log; restore replay drill |
| FX stale silent calc | NGOIS-PAY-0117 block |

## Checklist

- [ ] DPO reviewed
- [ ] Lawful basis documented per jurisdiction
- [ ] Retention periods mapped
- [ ] Sub-processor list current

This artifact does **not** close any gate that requires DPO sign-off.
