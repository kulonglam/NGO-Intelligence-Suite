# RB-11 — Backup Restore and Point-in-Time Recovery

| | |
| --- | --- |
| **ID** | RB-11 |
| **Applies to** | `BackupVerificationFailed`, `DataLossSuspected`, logical data corruption, accidental mass deletion, quarterly drill |
| **Severity** | SEV-1 for real data loss; not an incident for a drill |
| **Owner** | Data Architect |
| **Expected duration** | 1–6 hours |
| **Last verified** | 2026-06-15, quarterly drill |
| **Related** | [27 §27.3, §27.5](../27-disaster-recovery-and-bcp.md), [09 §9.6](../09-data-management-strategy.md) |

---

## 1. Symptoms

- `BackupVerificationFailed`: the weekly automated restore test did not pass.
- A tenant reports data that has vanished or that shows wrong values.
- Row count anomalies, or integrity check failures.
- A bad release or migration is known to have written incorrect data.
- Accidental mass deletion by a tenant administrator.
- A scheduled drill.

## 2. Impact

Depends entirely on scope. Establish scope before choosing a procedure, because the options range from a targeted repair affecting nothing else to a full restore that sacrifices good data.

## 3. Prerequisites

- Break-glass GCP console and `gcloud`.
- Break-glass database access; write access requires dual approval unless a SEV-1 is declared.
- Cloud SQL instance name, region, and the target recovery timestamp.
- **KMS key availability confirmed** — a restore without keys produces unreadable ciphertext.

## 4. Do not

- **Never restore over the live primary.** It destroys everything written since the restore point, including data written correctly. Always restore to a new instance and extract.
- **Do not choose a restore point without establishing when the corruption began.** Restoring to the wrong point either keeps the corruption or loses more than necessary.
- **Do not skip the decryption check.** Rows that exist but cannot be decrypted are not a recovered dataset.
- **Do not skip the erasure replay** ([§5.6](#56-mandatory-erasure-replay)). Restoring data that was lawfully erased re-creates a data protection violation.
- **Do not delete the corrupted data** before the restore is verified. It may be the only copy of something.
- **Do not let a tenant's request drive a platform-wide restore.** Use the tenant-level path.

## 5. Procedure

### 5.1 Establish scope and choose an approach

1. Determine what is wrong, how much, and since when:

```bash
# Row counts against expectation
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT 'beneficiaries' AS t, count(*) FROM beneficiaries WHERE is_deleted = false
  UNION ALL SELECT 'submissions', count(*) FROM submissions
  UNION ALL SELECT 'grants', count(*) FROM grants WHERE is_deleted = false;"

# When did it start? The audit trail is the primary evidence.
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT action, actor_id, occurred_at, count(*)
  FROM audit_records
  WHERE occurred_at > now() - interval '48 hours'
  GROUP BY action, actor_id, occurred_at
  HAVING count(*) > 100
  ORDER BY occurred_at;"
```

**Expected:** a bulk operation or a release timestamp that marks the boundary.

2. Choose the approach. **Prefer the least destructive that works:**

| Situation | Approach | Go to |
| --- | --- | --- |
| Rows soft-deleted | **Undelete.** No restore needed | 5.2 |
| Wrong values, reconstructable from the audit trail | **Targeted repair** | 5.3 |
| One tenant affected | **Tenant-level restore** | 5.4 |
| Multiple tenants, or structural corruption | **Full PITR to a clone, then extract** | 5.5 |
| Backup verification failed, no actual data loss | **Diagnose the backup**, not the data | 5.7 |
| Drill | Follow 5.5 against staging | 5.8 |

Most incidents in this category resolve at 5.2 or 5.3. Soft deletes exist precisely so that the common case of accidental deletion never requires a restore ([09 §9.1](../09-data-management-strategy.md)).

### 5.2 Undelete soft-deleted rows

3. Confirm what was deleted and by whom:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT id, deleted_at, deleted_by
  FROM beneficiaries
  WHERE is_deleted = true AND deleted_at > '<BOUNDARY_TIMESTAMP>'
  ORDER BY deleted_at;"
```

4. Restore via the API rather than by SQL, so the action is audited and downstream events fire:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  "$API/v1/platform/tenants/<TENANT_ID>/bulk-undelete" -d '{
    "entity": "beneficiaries",
    "deleted_after": "<BOUNDARY_TIMESTAMP>",
    "deleted_by": "<ACTOR_ID>",
    "reason": "accidental bulk delete, incident <INC>"
  }' | jq .
```

**Expected:** a count matching step 3, and derived aggregates recomputed. Go to §6.

### 5.3 Targeted repair from the audit trail

5. The audit trail records before and after state for every mutation, which makes reconstruction possible without a restore:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT entity_type, entity_id, action, occurred_at,
         before_state, after_state
  FROM audit_records
  WHERE entity_id = '<ENTITY_ID>'
  ORDER BY occurred_at;"
```

6. Build the repair as a reviewed, idempotent script with a dry-run mode. Have it reviewed by a second engineer before execution — a repair script under incident pressure is exactly the circumstance in which a `WHERE` clause gets omitted.

7. Dry run, review the output row by row for a small set or by sample for a large one, then execute inside a transaction:

```bash
psql "$DB_URL" -f repair.sql --set=DRY_RUN=1
psql "$DB_URL" -f repair.sql --set=DRY_RUN=0
```

8. Go to §6.

### 5.4 Tenant-level restore

9. Restore a clone at the chosen timestamp:

```bash
gcloud sql instances clone <INSTANCE> <INSTANCE>-restore-$(date +%Y%m%d) \
  --point-in-time="<TIMESTAMP_RFC3339>"
```

**Expected:** a new instance in `RUNNABLE` state within 20–40 minutes depending on size.

10. Verify the clone before extracting anything (see §5.6, which applies to every restore path).

11. Extract only that tenant's data:

```bash
pg_dump "$CLONE_URL" \
  --table='public.*' \
  --schema='tenant_<SLUG>' \
  --data-only \
  --file=/tmp/tenant-<SLUG>-restore.sql
```

For shared tables, extract with a tenant filter rather than dumping whole tables:

```bash
psql "$CLONE_URL" -c "\copy (
  SELECT * FROM beneficiaries WHERE tenant_id = '<TENANT_ID>'
) TO '/tmp/beneficiaries.csv' WITH CSV HEADER"
```

12. Load into an isolated staging schema on the primary — **never directly over live tables**:

```bash
psql "$DB_URL" -c "CREATE SCHEMA restore_<TENANT_SLUG>_$(date +%Y%m%d);"
# Load the extracted data into that schema.
```

13. Produce a diff for the tenant's administrator:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/platform/tenants/<TENANT_ID>/restore-preview" -d '{
    "staging_schema": "restore_<TENANT_SLUG>_<DATE>"
  }' | jq .
```

14. **The tenant approves the diff before the merge.** They are the only party who can say which version of a record is correct.

15. Merge the approved subset, then drop the staging schema and destroy the clone.

16. Go to §6.

### 5.5 Full PITR to a clone and extract

17. Determine the restore timestamp precisely: the last moment before the corruption began, established in step 1. Err **earlier**, not later — extra good data can be recovered from the live primary; corrupted data cannot be un-restored.

18. Clone as in step 9.

19. Verify the clone per §5.6.

20. Extract the affected tables or tenants only. Do not swap the whole database unless the corruption is genuinely universal, which is very rare.

21. Merge into the primary, preserving data written correctly after the corruption began. This is the step that requires the most care and the most review.

22. Recompute derived data:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/platform/analytics/recompute" -d '{
    "scope": "all_tenants",
    "since": "<BOUNDARY_TIMESTAMP>",
    "reason": "post-restore, incident <INC>"
  }' | jq .
```

23. Go to §6.

### 5.6 Mandatory verification of any restored dataset

Applies to every path above and to every drill. **A restore is not verified until all five checks pass.**

24. Structural integrity:

```bash
psql "$CLONE_URL" -c "
  SELECT count(*) AS invalid_constraints
  FROM pg_constraint WHERE NOT convalidated;"
psql "$CLONE_URL" -c "
  SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);"
```

**Expected:** zero invalid constraints, and zero tables missing RLS. **A restored instance with RLS disabled is a cross-tenant exposure**, and a hurried restore is exactly when this gets missed.

25. Row counts within expectation for the restore point.

26. **Decryption check — the one most often forgotten:**

```bash
curl -s -H "Authorization: Bearer $BG_TOKEN" \
  "$CLONE_API/v1/beneficiary/beneficiaries/<KNOWN_ID>" | \
  jq '{name_readable: (.data.first_name != null), id: .data.id}'
```

**Expected:** `name_readable: true`. If false, the KMS key for that tenant is unavailable or a version was disabled — stop and escalate. Rows of ciphertext are not recovered data ([27 §27.3.1](../27-disaster-recovery-and-bcp.md)).

27. Audit chain integrity:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$CLONE_API/v1/audit/verify-chain?from=<DATE>" | jq .
```

**Expected:** `valid: true`. A broken chain in restored data means either corruption or tampering — escalate to the Security Lead.

28. **Erasure replay.** Personal data erased before the restore point does not exist in the backup, but data erased *after* the restore point does. Restoring it re-creates a violation:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$CLONE_API/v1/platform/replay-erasures" -d '{
    "since": "<RESTORE_POINT>",
    "reason": "post-restore compliance, incident <INC>"
  }' | jq .
```

**Expected:** a count of erasures replayed, and zero failures. Verify by attempting to read a known-erased subject and confirming the personal data is absent. This step is a compliance obligation, not an optimisation ([17 §17.8](../17-privacy-and-compliance.md)).

29. Tenant isolation canary against the restored dataset before it serves any traffic.

### 5.7 Backup verification failed, no data loss

30. The weekly automated restore test failed. Nothing is wrong with production data; the ability to recover it is in question, which is nearly as serious.

31. Diagnose:

```bash
gcloud sql backups list --instance=<INSTANCE> --limit=10 \
  --format="table(id,windowStartTime,status,type)"
gcloud logging read \
  'resource.type="cloudsql_database" AND severity>=WARNING' \
  --freshness=7d --limit=50
```

32. Common causes:

| Cause | Fix |
| --- | --- |
| Backup did not complete — usually a long-running transaction | Investigate the transaction; backups compete with locks |
| The scratch instance could not be created — quota | Raise the quota |
| Integrity check failed on the restored instance | **Serious.** Escalate to the Data Architect immediately |
| The decryption check failed | A KMS key or version problem. Escalate |
| The verification job itself is broken | Fix the job; do not disable it |

33. Re-run the verification manually and confirm it passes. **Do not close the alert until a real restore has succeeded** — the alert exists to assert that recovery works, and silencing it without proof defeats the purpose.

### 5.8 Quarterly drill

34. Run §5.5 against staging, from the runbook alone, timed. The drill's purpose is to find gaps, so a drill that surfaces five problems is a good drill.

35. Record: elapsed time per phase against the RTO, every step where the runbook was wrong, every step requiring undocumented knowledge, and every point where the engineer had to guess.

36. **Correct the runbook the same day**, while the memory is fresh ([27 §27.9.1](../27-disaster-recovery-and-bcp.md)).

## 6. Verification

37. Data present and correct — confirmed by the affected tenant, not just by row counts.
38. All five checks in §5.6 passed.
39. Constraints valid, RLS enabled and forced on every table.
40. Decryption working on a sampled record per affected tenant.
41. Audit chain valid.
42. Erasure replay completed with zero failures.
43. Isolation canary passing.
44. Derived aggregates recomputed and reconciling.
45. Event consumers caught up ([RB-02](rb-02-dlq-drain-and-replay.md) if not).
46. Clone instance and staging schemas destroyed:

```bash
gcloud sql instances delete <INSTANCE>-restore-<DATE>
psql "$DB_URL" -c "DROP SCHEMA IF EXISTS restore_<TENANT_SLUG>_<DATE> CASCADE;"
```

**A forgotten restore clone is a copy of production data with weaker controls** — deleting it is a security step, not housekeeping.

47. Synthetic journeys passing.

## 7. Rollback

A restore that made things worse is itself recoverable, provided the original state was preserved. This is why nothing corrupted is deleted before verification. If a merge produced wrong results, restore the pre-merge state from the clone — which is why the clone is destroyed only at the end.

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| Any confirmed data loss | Chief Architect **and** Executive Director; SEV-1 |
| Decryption fails on restored data | Security Lead **and** Data Architect immediately |
| Audit chain invalid in restored data | Security Lead; possible tampering; [RB-14](rb-14-security-incident.md) |
| RLS not enabled on the restored instance | Security Lead; do not let it serve traffic |
| Backup integrity check failure | Data Architect; this is a recovery-capability incident |
| Erasure replay fails | DPO; a compliance issue |
| Corruption caused by a release | Chief Architect; the release is also a defect |
| Personal data may have been exposed | DPO; assess as a breach ([17 §17.11](../17-privacy-and-compliance.md)) |
| Unresolved after 4 hours | Platform Lead and Executive Director |

## 9. Follow-up

- Postmortem for any real data loss, however small. The RPO commitment is 5 minutes and zero for T0 data ([27 §27.2](../27-disaster-recovery-and-bcp.md)); any loss is a commitment breach.
- Notify affected tenants with specifics about what was lost or changed. A vague notification is worse than none.
- If corruption came from a release, add a test that would have caught it.
- If the audit trail was insufficient to reconstruct, that is an audit coverage gap — raise it.
- Confirm the restore clone is destroyed. Verify, do not assume.
- Update this runbook with anything that was wrong.
