# RB-06 — Tenant Offboarding and Data Deletion

| | |
| --- | --- |
| **ID** | RB-06 |
| **Applies to** | Contract end, tenant-requested termination, or termination for cause |
| **Severity** | Not an incident |
| **Owner** | Support Lead, with the DPO as approver |
| **Expected duration** | 30–90 days elapsed; roughly 3 hours of platform work |
| **Last verified** | 2026-05-27, staging |
| **Related** | [29 §29.8](../29-multi-tenancy-and-tenant-lifecycle.md), [17 §17.8](../17-privacy-and-compliance.md) |

---

## 1. When this runs

A tenant relationship is ending. The technical work is straightforward; the sequencing and the data obligations are not, and getting them wrong is either a data protection failure or the destruction of records a donor audit will later demand.

## 2. The governing tension

Two obligations pull in opposite directions and must both be satisfied:

| Obligation | Requires |
| --- | --- |
| **Data protection** — do not retain personal data longer than necessary | Delete beneficiary and employee personal data |
| **Donor accountability** — grant records must survive for the audit period, commonly 7 years under 2 CFR 200 | Retain financial and programme records |

The resolution: **personal data is deleted; de-identified programme and financial records are retained for the audit period.** A 2024 reach figure must remain accurate in a 2029 audit even though no individual in it is still identifiable.

## 3. Prerequisites

| Requirement | Why |
| --- | --- |
| Written termination notice, or a documented contract end date | Authority to proceed |
| **DPO approval of the deletion plan** | Determines what is deleted and what is retained |
| Confirmation of the audit retention obligation per grant | Some grants have longer obligations than others |
| The tenant's confirmation that they have received and validated their data export | Deletion is irreversible |
| A named tenant contact for the whole process | Offboarding without a counterpart goes wrong |

## 4. Do not

- **Do not delete anything before the export is confirmed received and readable.** The tenant must validate it, not merely receive it.
- **Do not delete financial or grant records** without checking the audit obligation per grant.
- **Do not drop the `tenant_<slug>` schema** until the retention period on payroll data has expired — 7 years post-termination for employment records.
- **Do not destroy the tenant's KMS key** while any retained ciphertext still needs to be readable. Key destruction makes retained encrypted data permanently unreadable.
- **Do not reuse the slug.** It appears in schema names and historical audit records.
- **Do not skip the suspension period.** Tenants regularly return within days asking for something they forgot.

## 5. Procedure

### 5.1 Day 0 — Confirm and plan

1. Record the termination in the tenant register with the effective date and reason.

2. Enumerate what exists, so the deletion plan is based on facts:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/tenants/<TENANT_ID>/data-inventory" | jq .
```

**Expected:** counts per entity — users, employees, beneficiaries, grants, submissions, files, payroll runs — plus storage bytes.

3. Determine the retention obligation per grant:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT g.grant_number, g.donor_name, g.end_date,
         g.retention_years,
         g.end_date + (g.retention_years || ' years')::interval AS retain_until
  FROM grants g
  WHERE g.is_deleted = false
  ORDER BY retain_until DESC;"
```

**Expected:** a retention date per grant. The latest one governs how long de-identified programme records are kept.

4. Draft the deletion plan and get DPO approval. It states, per data category: delete now, delete at a date, or retain de-identified until a date.

| Category | Default disposition |
| --- | --- |
| Beneficiary personal data | **Delete** at day 30 |
| Beneficiary de-identified records — identifier, dates, age band, sex, settlement | Retain until the latest grant retention date |
| Field submissions, PII field values | **Delete** at day 30 |
| Field submissions, non-identifying values | Retain until the latest grant retention date |
| Field media (photographs) | **Delete** at day 30 |
| Employee personal data | Retain 7 years post-termination (statutory employment record) |
| Payroll records | Retain 7 years (statutory) |
| Grant and financial records | Retain per grant obligation |
| Documents and contracts | Retain per grant obligation |
| Audit trail | Retain 7–10 years. **Never deleted** |
| System user accounts | Deactivate at day 0, delete personal data at day 30 |
| Telemetry | Ages out naturally per the retention tiers |
| Tenant configuration | Retain as part of the audit record |

### 5.2 Day 0 — Suspend

5. Suspend the tenant. This blocks all access while preserving everything:

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  "$API/v1/platform/tenants/<TENANT_ID>/suspend" -d '{
    "reason": "contract ended <DATE>, offboarding RB-06",
    "read_only_until": "<DAY_30_DATE>"
  }' | jq .
```

**Expected:** status `suspended`. Users see a clear message rather than an error. **Read access is retained until day 30** so the tenant can retrieve anything the export missed — this is deliberate and prevents most of the "we need one more thing" problems.

6. Confirm field devices are handled. Any device with unsynced data must sync before access is cut:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/tenants/<TENANT_ID>/devices?unsynced=true" | jq .
```

**Expected:** an empty list. If not, notify the tenant to have those officers sync before the read-only window closes, because that data will otherwise be lost with the device.

7. Cancel scheduled work: reports, IATI publication, notifications, AI budget allocation.

### 5.3 Day 1–7 — Export

8. Generate the full export:

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  "$API/v1/platform/tenants/<TENANT_ID>/export" -d '{
    "format": "json_and_csv",
    "include_files": true,
    "include_audit_trail": true,
    "reason": "offboarding"
  }' | jq .
```

**Expected:** a job handle. Completion time scales with data volume; a large tenant may take an hour.

9. The export contains everything the tenant is entitled to, with personal data **decrypted** — it is their data and they need it usable. This makes the export itself a highly sensitive artefact.

10. Deliver it securely:

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/exports/<EXPORT_ID>/share" -d '{
    "recipient_email": "<TENANT_ADMIN_EMAIL>",
    "expires_hours": 168
  }' | jq .
```

| Control | Detail |
| --- | --- |
| Signed URL, 7-day expiry | Not an email attachment |
| Recipient must authenticate | The URL alone is insufficient |
| Download is audited | Who, when, from where |
| Object lifecycle deletes it at 7 days | The export bucket has a hard 7-day rule ([21 §21.6.4](../21-deployment-and-infrastructure.md)) |

11. **Obtain written confirmation** that the tenant has downloaded the export and validated its contents. Deletion does not proceed without it. If the tenant does not respond, extend the read-only window rather than proceeding — deleting data the tenant has not verified they hold is the one irreversible mistake available here.

### 5.4 Day 30 — Delete personal data

12. Confirm the prerequisites one final time: export confirmed, DPO approval recorded, no unsynced devices, no open dispute.

13. Execute the deletion:

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  "$API/v1/platform/tenants/<TENANT_ID>/delete-personal-data" -d '{
    "plan_ref": "<DPO_APPROVED_PLAN_ID>",
    "confirm_export_received": true,
    "approver": "<DPO_NAME>"
  }' | jq .
```

The job, per the approved plan:

| # | Action |
| --- | --- |
| 1 | Overwrite encrypted PII columns on `beneficiaries` with a tombstone, retaining the de-identified shell |
| 2 | Delete PII-marked `submission_values`, retaining non-identifying values |
| 3 | Delete field media objects |
| 4 | Delete consent scans and photographs |
| 5 | Anonymise system user records: replace name and email with a tombstone, retain the ID so audit records remain attributable to a stable pseudonym |
| 6 | Emit `tenant.personal_data_deleted` so downstream services purge their derived copies |
| 7 | Record the deletion permanently in the audit trail — what was deleted, when, under whose approval |
| 8 | Issue a deletion certificate |

**Expected:** job `completed`, with per-category counts matching the inventory from step 2.

14. Note what is **not** deleted here: employee and payroll data (statutory 7-year retention), grant and financial records (donor audit obligation), and the audit trail itself.

15. Send the deletion certificate to the tenant.

### 5.5 Day 30 — Reduce the footprint

16. Scale the tenant's resource consumption to zero: remove quota allocations, remove their dashboard from the active set, remove them from the support rota and the deployment-calendar deadline list.

17. Revoke integration credentials specific to them: IATI publisher registration, mobile money account linkage, SMS sender identifier.

### 5.6 Long-term retention and final deletion

18. Set the calendared final-deletion dates from the plan:

| Data | Delete at |
| --- | --- |
| Employee and payroll data, `tenant_<slug>` schema | Termination + 7 years |
| Grant and financial records | The latest grant retention date |
| Documents | The latest grant retention date |
| Audit trail | Termination + 10 years |
| KMS key | **After all retained ciphertext is deleted.** Disabled, then scheduled for destruction with a 30-day reversible window |

19. Record these in the retention register so the automated sweep executes them ([09 §9.6](../09-data-management-strategy.md)). A calendar reminder is not sufficient — in seven years nobody will be watching a calendar.

20. Final deletion, when the last date passes, drops the `tenant_<slug>` schema, deletes remaining rows, deletes the storage prefixes, disables and schedules destruction of the KMS key, and retains only the tenant register entry recording that the tenant existed and was deleted.

## 6. Verification

| Stage | Check | Expected |
| --- | --- | --- |
| Day 0 | Tenant status | `suspended`, read-only |
| Day 0 | Login attempt by a tenant user | Blocked with a clear message |
| Day 7 | Export downloaded and confirmed | Written confirmation on file |
| Day 30 | Beneficiary PII columns | Tombstoned; a sampled read returns no personal data |
| Day 30 | De-identified records | Present; historical reach figures unchanged |
| Day 30 | Field media | Objects gone; a signed URL request returns 404 |
| Day 30 | Deletion certificate | Issued and sent |
| Day 30 | Audit trail | Intact, including the deletion record |
| Day 30 | Export artefact | Auto-deleted from the export bucket |
| Day 30 | **Other tenants** | Entirely unaffected; isolation canary passes |
| Final | Schema, storage, key | Gone; register entry retained |

Verify a retained programme aggregate has not changed:

```bash
psql "$DB_URL" -c "
  SELECT reporting_period, beneficiaries_reached, activities_delivered
  FROM programme_aggregates
  WHERE tenant_id = '<TENANT_ID>'
  ORDER BY reporting_period;"
```

**Expected:** identical to the pre-deletion values. If a reach figure changed, the de-identification removed too much and the deletion plan was wrong.

## 7. Rollback

| Stage | Reversible? |
| --- | --- |
| Suspension | Yes — reactivate |
| Export | Yes — regenerate |
| **Personal data deletion** | **No.** Irreversible. Backups age out within 12 months and are not restored to undo a deliberate deletion |
| Final deletion | No |

The irreversibility is why steps 11 and 12 exist and why they are not optional.

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| Tenant disputes the termination or the deletion | Executive Director; **halt deletion** |
| Unsynced field data on devices | Support Lead; extend the read-only window |
| Uncertainty about a retention obligation | DPO **and** Finance; retain rather than delete when unsure |
| Export fails or is incomplete | Platform Lead; do not proceed to deletion |
| Legal hold, litigation, or an active audit | Legal; **halt all deletion** and record the hold |
| Any other tenant affected by an offboarding action | Security Lead immediately, SEV-1 |

## 9. Follow-up

- Confirm the retention register entries exist and are scheduled.
- Confirm the tenant is removed from the sub-processor notification list.
- Update the capacity model to release their projected volumes.
- Record the offboarding reason for the product review — a tenant leaving is information.
- If any step required manual work outside the provided jobs, raise the automation gap.
