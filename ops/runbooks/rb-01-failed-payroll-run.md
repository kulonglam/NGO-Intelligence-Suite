# RB-01 — Failed payroll run (ops stub)

Canonical procedure: [`docs/sdd/runbooks/rb-01-failed-payroll-run.md`](../../docs/sdd/runbooks/rb-01-failed-payroll-run.md).

**Local evidence:** interrupted calculate sets `payroll_runs.status = failed`, clears partial records, and records `failure_reason` (`hr-payroll-service` calculate route).
