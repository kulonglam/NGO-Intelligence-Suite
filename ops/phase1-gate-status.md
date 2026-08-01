# Phase 1 gate status (SDD §31.3.3)

> Updated by local drills and CI. **BLOCKED** gates require production cloud or an external party — they are not claimed as passed.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Tenant isolation suite (15 categories) | PASS (local) | `npm run test:isolation` |
| 2 | Production canary green 14 consecutive days | BLOCKED | Needs prod telemetry; local: `npm run canary:local` + `infra/kubernetes/canary/PROGRESSIVE_ROLLOUT.md` |
| 3 | Every tenant-owned table RLS enabled+forced | PASS (local) | `npm run verify:rls` |
| 4 | No service role has `rolbypassrls` | PASS (local) | `npm run verify:rls` / isolation ISO-14 |
| 5 | Complete RBAC matrix verified by generated tests | PASS (local) | `npm run test -w @ngois/rbac` |
| 6 | Maker-checker on disbursements at DB level | PASS (local) | Schema `disbursements_approver_differs` + finance APIs |
| 7 | Audit hash chain verifies | PASS (local) | `npm run drill:audit` → `ops/drills/evidence/audit-chain.json` |
| 8 | PII encryption sample decrypt succeeds | PASS (local) | `npm run drill:encryption` → `ops/drills/evidence/encryption-sample.json` |
| 9 | Backup restore drill (incl. erasure replay local) | PASS (local) | `npm run drill:backup` → `ops/drills/evidence/backup-restore.json` |
| 10 | Regional failover drill to documented RTO | PASS (local) | `npm run drill:dr-failover` → `ops/drills/evidence/dr-failover.json` (cloud RTO still separate) |
| 11 | Every alert resolves to an existing runbook | PASS (local) | `npm run verify:alerts-runbooks` |
| 12 | Penetration test: no Critical/High outstanding | BLOCKED | External firm; prep: `npm run pen-test:selfcheck` + `ops/compliance/pen-test-engagement-pack.md` |
| 13 | WCAG 2.1 AA on shipped journeys | PASS (local) | `npm run test:browser` (axe serious/critical = 0) |
| 14 | Every journey completes in Arabic RTL | PASS (local) | `npm run test:browser` RTL path |
| 15 | Load test L1 and L2 at latency budget | PASS (local scaled) | `npm run test:load` (scaled VUs) |
| 16 | Rollback demonstrated within 5 min | PASS (local) | `npm run drill:rollback-local` → `ops/drills/evidence/rollback-local.json` |
| 17 | Both design-partner tenants via RB-05 + isolation | PASS (local) | Seed `design-partner` + `design-partner-b`; `npm run drill:rb05` |
| 18 | Coverage floors (95% authz/encryption) | PASS (local) | `npm run test:coverage` |

## How to refresh local evidence

```powershell
npm run stack:prod-shaped
npm run drill:dr-failover
npm run drill:rollback-local
npm run pen-test:selfcheck
npm run terraform:validate
npm run drill:phase1
npm run verify:phase1-gates
```
