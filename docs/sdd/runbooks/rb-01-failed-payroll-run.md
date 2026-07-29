# RB-01 — Failed or Stalled Payroll Run

| | |
| --- | --- |
| **ID** | RB-01 |
| **Applies to** | `PayrollRunFailed`, `PayrollRunStalled`, or a tenant reporting a run that will not complete |
| **Severity** | SEV-2. **SEV-1 if a statutory payment deadline is within 48 hours** |
| **Owner** | Platform Lead |
| **Expected duration** | 30–90 minutes |
| **Last verified** | 2026-05-14, staging |
| **Related** | [06 §6.3.5](../06-microservice-design.md), [Appendix I](../appendices/i-algorithms.md) |

---

## 1. Symptoms

- `ngois_payroll_computation_errors_total` has incremented.
- A run has been in status `computing` for more than 15 minutes.
- A tenant reports that a run shows an error, or that payslip totals look wrong.
- `hr-payroll-service` logs contain `operation: payroll.run.compute` with `outcome: failure`.

## 2. Impact

Staff cannot be paid until the run completes and is approved. Statutory returns depend on the run. **This is one of the few failures with an external legal deadline**, so establish the deadline before anything else — it determines the severity and whether escalation is immediate.

## 3. Prerequisites

- Grafana access (dashboard D-10, Payroll).
- Break-glass Kubernetes read.
- Break-glass database read-only for the affected tenant.
- The tenant's payroll deadline, from the tenant admin or the payroll calendar.

## 4. Do not

- **Do not delete the failed run.** It holds the diagnostic state, and the run number is referenced by statutory records.
- **Do not manually edit `payroll_records` or `payroll_record_lines`.** A hand-corrected payslip has no reproducible computation trail and will fail audit.
- **Do not re-run without first setting the run to `failed`.** Two concurrent runs for the same period will produce duplicate records.
- **Do not deploy `hr-payroll-service` while a run is in progress.** The deployment gate normally prevents this ([22 §22.5.2](../22-cicd-release-supply-chain.md)); do not override it.

## 5. Procedure

### 5.1 Establish the facts

1. Open dashboard **D-10** and identify the tenant, the run ID, the country, and the status.

2. Get the run record:

```bash
# Break-glass DB read
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT id, pay_period_start, pay_period_end, country_code, status,
         tax_ruleset_hash, exchange_rate, exchange_rate_date,
         prepared_by, prepared_at, computation_state
  FROM tenant_<TENANT_SLUG>.payroll_runs
  WHERE id = '<RUN_ID>';"
```

**Expected:** one row. Note `status` and `computation_state`, which records how far the computation reached.

3. Get the error detail:

```bash
logcli query '{service="hr-payroll-service"} |= "<RUN_ID>" | json | level="error"' --since=2h
```

**Expected:** one or more error lines with an error code and the employee ID being processed when it failed.

### 5.2 Classify the failure

| Error code | Cause | Go to |
| --- | --- | --- |
| `NGOIS-PAY-0031` | No effective tax band set for the period | 5.3 |
| `NGOIS-PAY-0032` | Missing or stale exchange rate | 5.4 |
| `NGOIS-PAY-0041` | Employee data incomplete — missing contract, TIN or bank detail | 5.5 |
| `NGOIS-PAY-0052` | Arithmetic or rounding assertion failed | 5.6 |
| `NGOIS-PAY-0061` | Statement timeout or database error | 5.7 |
| No error, status stuck at `computing` | The worker died mid-run | 5.8 |
| Anything else | 5.6, then escalate |

### 5.3 Missing tax bands

4. Check for bands effective for the period:

```bash
psql "$DB_URL" -c "
  SELECT tax_type, band_order, lower_bound, upper_bound, rate_percent,
         effective_from, effective_to, legal_reference
  FROM tax_bands
  WHERE country_code = '<CC>'
    AND effective_from <= '<PERIOD_END>'
    AND (effective_to IS NULL OR effective_to >= '<PERIOD_START>')
  ORDER BY tax_type, band_order;"
```

**Expected:** a complete band set with no gaps and no overlaps.

5. If bands are missing or a new statutory schedule has taken effect, **stop.** Statutory rate entry requires `finance_manager` creation plus a second approval ([15 §15.2.3](../15-rbac-and-authorization.md)) and cannot be done from the on-call seat. Escalate to the Platform Lead and notify the tenant's finance manager that rates must be entered and approved before the run can proceed.

6. Once the bands are in place, go to 5.9.

### 5.4 Missing or stale exchange rate

7. Check the rate:

```bash
psql "$DB_URL" -c "
  SELECT pair, rate, rate_date, source, fetched_at
  FROM fx_rates
  WHERE pair = '<PAIR>'
  ORDER BY rate_date DESC LIMIT 5;"
```

8. If the rate source has failed, follow [RB-15](rb-15-integration-failure.md) §5.5 to diagnose the feed, then return here.

9. If a rate is genuinely unavailable and the deadline is close, the tenant's `finance_manager` may enter a manual override with a recorded reason. **The on-call engineer does not enter the rate**; the override is a tenant financial decision and is audited as one.

10. Go to 5.9.

### 5.5 Incomplete employee data

11. Identify the employees blocking the run:

```bash
curl -s -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/hr/payroll-runs/<RUN_ID>/validation-errors" | jq .
```

**Expected:** a list of employee IDs and the specific missing field per employee.

12. Notify the tenant's `hr_manager` with that list. **The data must be corrected by the tenant**, not by the on-call engineer.

13. Two options, and the tenant chooses:
    - Correct the records, then re-run (5.9).
    - Exclude the affected employees from this run and process them in a supplementary run. Excluding is recorded on the run.

### 5.6 Arithmetic assertion failure

This is the most serious branch. The computation detected an internal inconsistency and refused to produce a payslip, which is the correct behaviour.

14. Extract the failing employee's computation input from the log line and the run's `computation_state`.

15. **Escalate immediately to the Platform Lead and the Chief Architect.** A payroll arithmetic assertion failure is a suspected defect in a 95-per-cent-coverage module and needs the owning engineer.

16. Do not attempt a re-run. If it is a deterministic defect, a re-run will fail identically; if it is not deterministic, a re-run may produce a *wrong payslip that succeeds*, which is far worse than a failed run.

17. Notify the tenant that the run is blocked pending investigation, and give them the deadline position honestly.

### 5.7 Database error or timeout

18. Check D-04 for database health. If the database is impaired, follow [RB-03](rb-03-database-failover.md) first; payroll is a symptom, not the cause.

19. If the database is healthy and a single query timed out, the run may simply be large. Check the run size:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT count(*) FROM tenant_<TENANT_SLUG>.payroll_records WHERE run_id = '<RUN_ID>';"
```

20. If the employee count exceeds 1,500, the run is beyond the tested profile ([25 §25.6](../25-performance-and-capacity.md), B-5). Escalate to the Platform Lead; the run may need to be split by department.

21. Otherwise go to 5.9.

### 5.8 Stalled run, no error

22. Check whether the worker pod survived:

```bash
kubectl -n ngois-core get pods -l app=hr-payroll-service
kubectl -n ngois-core logs -l app=hr-payroll-service --previous --tail=200 | grep -i oom
```

**Expected:** if a pod was OOM-killed or evicted, the run has no live worker and will never progress.

23. Confirm no worker holds the run's advisory lock:

```bash
psql "$DB_URL" -c "
  SELECT pid, state, query_start, left(query, 80)
  FROM pg_stat_activity
  WHERE query ILIKE '%payroll%' AND state <> 'idle';"
```

**Expected:** no active payroll query. If one is running, the run is progressing slowly — wait, do not intervene.

24. If there is genuinely no worker, mark the run failed so it can be re-run:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  "$API/v1/hr/payroll-runs/<RUN_ID>/mark-failed" \
  -d '{"reason":"worker terminated mid-run, RB-01 step 24, incident <INC>"}'
```

**Expected:** 200, status becomes `failed`. Partial `payroll_records` for the run are removed by the same operation — the run is atomic by design, so there is no half-computed state to reconcile.

25. Go to 5.9.

### 5.9 Re-run

26. Confirm the run status is `failed` or `draft`, never `computing`.

27. Ask the tenant's `hr_manager` or `finance_manager` to re-trigger the run through the UI. **The on-call engineer does not trigger a payroll run**: preparation is a tenant action with an audit trail and a named preparer, and initiating it from the platform seat would break separation of duties ([15 §15.5](../15-rbac-and-authorization.md)).

28. Watch D-10 while it runs. Expected duration is roughly 0.35 seconds per employee.

## 6. Verification

29. Run status is `computed` or `pending_approval`.
30. `ngois_payroll_computation_errors_total` has not incremented further.
31. Record count equals the expected employee count.
32. Totals reconcile:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT r.total_gross_local, r.total_paye_local, r.total_net_usd,
         sum(pr.gross_local) AS sum_gross,
         sum(pr.paye_local)  AS sum_paye
  FROM tenant_<TENANT_SLUG>.payroll_runs r
  JOIN tenant_<TENANT_SLUG>.payroll_records pr ON pr.run_id = r.id
  WHERE r.id = '<RUN_ID>'
  GROUP BY r.id, r.total_gross_local, r.total_paye_local, r.total_net_usd;"
```

**Expected:** run totals equal the sums exactly. Any discrepancy is a SEV-1 and goes to 5.6.

33. The tenant's finance manager confirms a sampled payslip looks correct.

## 7. Rollback

If a re-run produces incorrect output, the tenant's `finance_manager` reverses the run through the reversal workflow, which creates a compensating record set rather than deleting anything. Never delete payroll records.

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| Arithmetic assertion failure (5.6) | Platform Lead **and** Chief Architect, immediately |
| Statutory rates missing or wrong | Platform Lead; tenant finance manager |
| Deadline within 48 h and unresolved | Platform Lead **and** Executive Director |
| Any suspicion that a *completed* run produced wrong figures | Chief Architect; treat as SEV-1 |
| Unresolved after 90 minutes | Platform Lead |

## 9. Follow-up

- Postmortem required for any SEV-2 or above ([26 §26.6](../26-reliability-and-incident-management.md)).
- If the cause was missing data or a missing rate, the action item is a **pre-run validation gate** so the run fails at preparation rather than mid-computation.
- If the cause was a defect, add the failing case to the payroll worked-example fixtures ([23 §23.4.2](../23-testing-strategy.md)).
- Update this runbook the same day if any step was wrong or missing.
