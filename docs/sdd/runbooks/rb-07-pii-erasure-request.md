# RB-07 — Personal Data Erasure Request

| | |
| --- | --- |
| **ID** | RB-07 |
| **Applies to** | An approved erasure request for a beneficiary, an employee, or a system user |
| **Severity** | Not an incident. SLA-bound at 30 days |
| **Owner** | DPO, executed by the tenant with platform support |
| **Expected duration** | 1–2 hours of work within a 30-day SLA |
| **Last verified** | 2026-04-30, staging |
| **Related** | [17 §17.7–17.8](../17-privacy-and-compliance.md), [06 §6.3.6](../06-microservice-design.md) |

---

## 1. When this runs

A data subject has asked for their personal data to be erased, and the request has been assessed and approved. Most erasure requests in this platform arrive through a field officer rather than by email ([17 §17.7.1](../17-privacy-and-compliance.md)), so the request path starts offline.

## 2. Who does what

Erasure is a **tenant action**, not a platform action. The platform team supports it; the tenant executes it. This matters because the tenant is the data controller and the decision is theirs.

| Role | Responsibility |
| --- | --- |
| Field officer or feedback desk | Receives the request, verifies identity proportionately, records it |
| `m_e_officer` | Validates and routes the request |
| Tenant DPO or `org_admin` | Assesses lawfulness, approves, executes |
| Platform team | Verifies the mechanism worked; investigates any residue; never executes the erasure |
| Platform DPO | Consulted on any contested or unusual case |

## 3. Prerequisites

- The request recorded in the platform with the identity verification method used.
- Legal-hold check completed.
- Approver is a different person from the requester's recorder.
- Step-up MFA available to the approver.

## 4. Do not

- **Do not execute an erasure from the platform seat.** It is the tenant's decision and their audit trail.
- **Do not delete rows directly with SQL.** The erasure workflow tombstones specific fields and preserves the de-identified shell; a `DELETE` breaks historical reporting and referential integrity.
- **Do not refuse a request with a blanket "we must keep it".** Tell the requester precisely what is retained, why, and until when.
- **Do not rewrite backups.** Erased data persists in backups until they age out, at 12 months maximum. This is disclosed, not hidden.
- **Do not delete the audit record of the erasure.** It is the proof the erasure happened.
- **Do not use erasure to resolve a duplicate record.** Duplicates are merged, not erased ([13 §13.6](../13-offline-first-architecture.md)).

## 5. Procedure

### 5.1 Record and verify

1. Confirm the request is recorded with the required fields:

```bash
curl -s -H "Authorization: Bearer $TENANT_TOKEN" \
  "$API/v1/beneficiary/erasure-requests/<REQUEST_ID>" | jq .
```

**Expected:** subject type and ID, requested date, verification method, recorder, and current status `pending_assessment`.

2. Identity verification is deliberately proportionate rather than documentary. Demanding an identity document from someone who fled without one would deny the right to exactly the people most in need of it. Acceptable methods, and the one used is recorded:

| Method | When |
| --- | --- |
| Knowledge of registration details — date, location, household composition | Default |
| Community or committee verification | Where a third party can vouch |
| Field officer recognition | Where the officer registered them personally |
| Documentary identity | Where the person has documents and offers them |

3. If verification cannot be established, the request is not refused — it is paused with a recorded reason and the requester is told what would satisfy it.

### 5.2 Assess legal holds

4. Run the pre-erasure check. **This is the step that determines whether erasure can proceed at all:**

```bash
curl -s -H "Authorization: Bearer $TENANT_TOKEN" \
  "$API/v1/beneficiary/beneficiaries/<SUBJECT_ID>/erasure-eligibility" | jq .
```

**Expected:** a structured answer:

```json
{
  "eligible": false,
  "blocking_obligations": [
    {
      "type": "donor_audit_retention",
      "grant_number": "USAID-2024-0117",
      "basis": "2 CFR 200.334",
      "scope": "financial and distribution records referencing this beneficiary",
      "expires": "2031-09-30"
    }
  ],
  "erasable_now": [
    "name", "date_of_birth", "national_identifier", "phone",
    "photograph", "precise_coordinates", "emergency_contact"
  ],
  "retained_deidentified": [
    "beneficiary identifier", "age band", "sex",
    "settlement", "registration and exit dates",
    "assistance received (quantities and dates)"
  ]
}
```

5. Note the important nuance: an obligation almost never blocks the erasure of **identifying fields**. It blocks the destruction of the **record of assistance**, which can be retained de-identified. So the usual outcome is partial erasure that satisfies both obligations, not refusal.

6. If something genuinely cannot be erased, the response to the requester states the specific obligation, its legal basis, its scope, and its expiry date — as in the JSON above. A vague refusal is not acceptable and is a compliance failure in itself.

### 5.3 Approve

7. The tenant DPO or `org_admin` approves, with step-up MFA, and **must be a different person** from whoever recorded the request:

```bash
curl -s -X POST -H "Authorization: Bearer $APPROVER_TOKEN" \
  -H "X-MFA-Token: <STEP_UP_CODE>" \
  -H "Idempotency-Key: $(uuidgen)" \
  "$API/v1/beneficiary/erasure-requests/<REQUEST_ID>/approve" -d '{
    "scope": "identifying_fields",
    "acknowledge_irreversible": true,
    "acknowledge_backup_persistence": true,
    "notes": "<ASSESSMENT SUMMARY>"
  }' | jq .
```

**Expected:** 201. The API rejects the request if the approver is the same person as the recorder (`NGOIS-BEN-0044`) or if either acknowledgement is absent.

8. The two acknowledgements exist because the requester must have been told, before approval, that the erasure cannot be undone and that backup persistence continues for up to 12 months.

### 5.4 Execute

9. Execute:

```bash
curl -s -X POST -H "Authorization: Bearer $APPROVER_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  "$API/v1/beneficiary/beneficiaries/<SUBJECT_ID>/erasure" -d '{
    "request_id": "<REQUEST_ID>"
  }' | jq .
```

The orchestration, per [17 §17.8](../17-privacy-and-compliance.md):

| # | Service | Action |
| --- | --- | --- |
| 1 | `beneficiary-service` | Overwrite encrypted identifying columns with a tombstone; retain the de-identified shell |
| 2 | `beneficiary-service` | Emit `beneficiary.erased` |
| 3 | `field-data-service` | Purge PII-marked submission values for this subject; retain non-identifying values |
| 4 | `file-service` | Delete photographs and consent scans |
| 5 | `notification-service` | Remove contact details from notification preferences and queues |
| 6 | `analytics-service` | Recompute any aggregate that referenced identifying attributes |
| 7 | `audit-service` | Record the erasure: who, when, why, what was erased. **Not what the erased values were** |

**Expected:** status `completed` within 2 minutes, with per-step confirmation. If any step fails, the request stays `in_progress` and retries; it does not silently partially complete.

### 5.5 Platform verification

10. This is the platform team's contribution: verify no residue. Check the primary record:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT id,
         first_name_encrypted IS NULL       AS name_cleared,
         dob_encrypted IS NULL              AS dob_cleared,
         national_id_encrypted IS NULL      AS nid_cleared,
         phone_encrypted IS NULL            AS phone_cleared,
         name_blind_index IS NULL           AS blind_index_cleared,
         precise_coordinates IS NULL        AS coords_cleared,
         age_band, sex, settlement,
         registered_at, exited_at,
         erased_at, erasure_request_id
  FROM beneficiaries WHERE id = '<SUBJECT_ID>';"
```

**Expected:** every `*_cleared` column `t`; the de-identified attributes still present; `erased_at` set.

The blind index deserves attention: it is a searchable derivative of the name, so leaving it behind would leave the name effectively recoverable by dictionary search. Confirm it is cleared.

11. Check submissions:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT sv.id, ff.field_key, ff.is_pii, sv.value_encrypted IS NULL AS cleared
  FROM submission_values sv
  JOIN form_fields ff ON ff.id = sv.field_id
  JOIN submissions s ON s.id = sv.submission_id
  WHERE s.beneficiary_id = '<SUBJECT_ID>'
  ORDER BY ff.is_pii DESC;"
```

**Expected:** every row with `is_pii = true` has `cleared = t`. Non-PII values remain.

12. Check files:

```bash
gsutil ls "gs://ngois-prod-field-media/<TENANT_SLUG>/beneficiaries/<SUBJECT_ID>/"
```

**Expected:** `CommandException: One or more URLs matched no objects` — that is success.

13. Check search and cache do not still return the subject:

```bash
curl -s -H "Authorization: Bearer $TENANT_TOKEN" \
  "$API/v1/beneficiary/beneficiaries?q=<KNOWN_NAME>" | jq '.data | length'
```

**Expected:** `0`.

14. Confirm the audit record exists and contains no erased values:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT action, actor_id, occurred_at, metadata
  FROM audit_records
  WHERE entity_id = '<SUBJECT_ID>' AND action = 'beneficiary.erased';"
```

**Expected:** one record naming the approver and the request, with metadata listing which **field names** were erased and no values.

15. Confirm historical aggregates are unchanged:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT reporting_period, beneficiaries_reached
  FROM programme_aggregates ORDER BY reporting_period DESC LIMIT 6;"
```

**Expected:** identical to the pre-erasure values. A changed reach figure means the erasure removed a record it should only have de-identified — escalate to the DPO and Data Architect.

### 5.6 Respond

16. Issue the certificate:

```bash
curl -s -H "Authorization: Bearer $TENANT_TOKEN" \
  "$API/v1/beneficiary/erasure-requests/<REQUEST_ID>/certificate" | jq .
```

17. Deliver the response through the same channel the request arrived by, in the requester's language, stating what was erased, what is retained and why, until when, and that backups age out within 12 months.

18. Close the request. Confirm the 30-day SLA was met.

### 5.7 Employee and system user variants

19. **Employee erasure** is usually not available in full: employment records carry a 7-year statutory retention in both operating jurisdictions. The eligibility check will report this. What can be erased earlier is non-statutory data — personal email, emergency contact, photograph. Handle as a partial erasure with a clear explanation.

20. **System user erasure** anonymises the account: name and email replaced with a tombstone, the user ID retained so audit records remain attributable to a stable pseudonym. Audit attributability is a compliance obligation and survives erasure of the identity.

## 6. Backup persistence

21. Erased data remains in backups until they age out. The controls:

| Control | Detail |
| --- | --- |
| Maximum persistence | 12 months, the longest logical backup retention |
| Disclosure | Stated to the requester before approval |
| **On restore** | The erasure log is replayed against restored data before the restore is made available. This is a mandatory step in [RB-11](rb-11-backup-restore-drill.md) |
| Access | Backups are not queryable; access requires break-glass and is audited |

22. If a restore occurs during the persistence window, verify the erasure replay ran and that the subject's data is absent from the restored dataset.

## 7. Escalation

| Condition | Escalate to |
| --- | --- |
| Identity cannot be verified | Tenant DPO; pause, do not refuse |
| The requester disputes a retention obligation | Platform DPO |
| Residue found in step 10–13 | Platform DPO **and** Data Architect. This is a defect in the erasure workflow and a compliance issue |
| Historical aggregates changed | DPO and Data Architect immediately |
| A request that appears coerced, or made on someone's behalf without authority | Tenant protection focal point and DPO. In a conflict setting a third party requesting erasure of someone's records may be an attempt to remove their assistance entitlement |
| Erasure job stuck `in_progress` over 30 minutes | Platform Lead |
| 30-day SLA at risk | DPO |

The coercion case is genuinely important and easy to overlook. Erasure is a right of the data subject, and a request arriving through someone else needs the same scrutiny as any other action taken on a vulnerable person's behalf.

## 8. Follow-up

- Record the request in the quarterly erasure audit ([17 §17.13](../17-privacy-and-compliance.md)).
- If any residue was found, raise a defect and add a test case to the erasure integration suite.
- If the eligibility check gave a misleading answer, correct the retention configuration for that grant.
- Track the request-to-completion time against the 30-day SLA.
