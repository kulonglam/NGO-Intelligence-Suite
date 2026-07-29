# Appendix E — Error Code Registry

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Owner:** Chief Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Source of truth:** the error taxonomy in [10 §10.9](../10-api-design-standards.md). Codes are allocated here and referenced by runbooks, client code and support scripts.

---

## E.1 Why a registry exists

An error code is a contract. It appears in a client's error handler, in a support ticket, in a log query, and in a runbook decision table. Once published it cannot be reused for a different meaning, and its message cannot change meaning even if the wording improves.

Two consequences follow. **A code is never deleted**, only marked deprecated. And **changing what a code means is a breaking API change** ([ADR-0009](../adr/0009-uri-path-api-versioning.md)).

### E.1.1 Format

`NGOIS-<DOMAIN>-<NNNN>`, for example `NGOIS-PAY-0117`.

| Domain | Owner service |
| --- | --- |
| `API` | Cross-cutting protocol errors, emitted by the gateway or any service |
| `AUTH` | `auth-service` |
| `TEN` | `tenant-service` |
| `GRANT` | `grant-service` |
| `FIN` | `grant-service` finance subset |
| `HR` | `hr-payroll-service`, employment subset |
| `PAY` | `hr-payroll-service`, payroll subset |
| `BEN` | `beneficiary-service` |
| `FLD` | `field-data-service` |
| `LMS` | `lms-service` |
| `RPT` | `reporting-service` |
| `FILE` | `file-service` |
| `NOTIF` | `notification-service` |
| `INTEG` | `integration-service` |
| `AI` | `ai-insights-service` |
| `DB` | Database-level constraint and trigger errors |

### E.1.2 Number ranges within a domain

| Range | Category |
| --- | --- |
| 0001–0019 | Request validation and schema |
| 0020–0049 | Domain rule violation, including a missing prerequisite that blocks an operation |
| 0050–0069 | Authorisation, policy and access |
| 0070–0099 | Conflict, concurrency, idempotency, capacity |
| 0100–0129 | Reference data missing or stale; external dependency |
| 0130–0149 | Internal error |

The `API` and `DB` domains use a flat sequence, because their errors are protocol- and storage-level rather than domain-categorised.

### E.1.3 What every error response contains

```json
{
  "error": {
    "code": "NGOIS-GRANT-0021",
    "message": "Disbursement exceeds the grant ceiling.",
    "detail": "Requested 50,000.00 USD; 12,400.00 USD remains of a 500,000.00 USD ceiling.",
    "remediation": "Reduce the amount, or request a budget revision.",
    "correlation_id": "8f2c...",
    "documentation_url": "https://docs.ngointelligence.io/errors/NGOIS-GRANT-0021"
  }
}
```

Three rules on content, each of which exists because its violation has caused a real support cost somewhere:

**`detail` states the actual values.** "Exceeds the ceiling" is not actionable; the remaining amount is ([04](../04-architecture-principles.md)).

**`detail` and `remediation` never contain personal data.** They appear in logs and in client-side error reports.

**A 403 names the required permission**, so the user can ask for the right thing ([30 US-04](../30-quality-attributes-nfr.md)).

---

## E.2 `API` — cross-cutting

| Code | HTTP | Meaning | Remediation offered |
| --- | --- | --- | --- |
| `NGOIS-API-0001` | 400 | Malformed JSON body | Correct the syntax |
| `NGOIS-API-0002` | 400 | Schema validation failed; `errors[]` lists each field | Correct the named fields |
| `NGOIS-API-0003` | 400 | Unknown query parameter or filter expression | Consult the filtering DSL |
| `NGOIS-API-0004` | 400 | Page size above the maximum | Reduce `limit` |
| `NGOIS-API-0005` | 400 | Invalid or expired cursor | Restart pagination |
| `NGOIS-API-0006` | 401 | Missing, malformed or expired token | Re-authenticate. **Local offline data is preserved** — stated explicitly because field officers see this one |
| `NGOIS-API-0007` | 401 | Token signature invalid | Re-authenticate; investigated if repeated |
| `NGOIS-API-0008` | 403 | Permission denied; the message **names the required permission** | Request the permission from an `org_admin` |
| `NGOIS-API-0009` | 422 | Idempotency key reused with a different request body | Use a new key, or resend the original body |
| `NGOIS-API-0010` | 409 | The original request for this idempotency key is still processing; `Retry-After: 2` | Retry after the interval |
| `NGOIS-API-0011` | 412 | ETag mismatch; the record changed since it was read | Re-read and reapply the change |
| `NGOIS-API-0012` | 404 | Resource not found, **or not visible to this actor** | — |
| `NGOIS-API-0013` | 405 | Method not permitted on this resource | — |
| `NGOIS-API-0014` | 415 | Unsupported content type | — |
| `NGOIS-API-0015` | 413 | Payload above the limit | Chunk the request |
| `NGOIS-API-0016` | 429 | Rate limit exceeded; `Retry-After` and the tier are stated | Retry, or discuss the tier |
| `NGOIS-API-0017` | 410 | API version sunset | Upgrade the client |
| `NGOIS-API-0018` | 400 | **A client attempted to supply a tenant or user identity header** | Never legitimate. **Logged as a security event** ([RB-14](../runbooks/rb-14-security-incident.md)) |
| `NGOIS-API-0050` | 500 | Unhandled internal error; `correlation_id` returned | Contact support with the correlation ID |
| `NGOIS-API-0051` | 503 | Service shedding load; `Retry-After` set | Retry with backoff ([23 §23.11.1](../23-testing-strategy.md), L10) |
| `NGOIS-API-0052` | 504 | Upstream dependency timeout | Retry |
| `NGOIS-API-0053` | 503 | Dependency circuit breaker open; the degraded behaviour is described | Proceed with the documented degradation |

`NGOIS-API-0012` deliberately returns 404 rather than 403 for a record in another tenant. Distinguishing "does not exist" from "exists but is not yours" would confirm the existence of another tenant's record, which is an information disclosure.

---

## E.3 `AUTH` and `TEN`

| Code | HTTP | Meaning |
| --- | --- | --- |
| `NGOIS-AUTH-0001` | 400 | Password does not meet policy; the unmet requirements are listed |
| `NGOIS-AUTH-0020` | 401 | Invalid credentials. **Deliberately identical whether or not the account exists** |
| `NGOIS-AUTH-0021` | 423 | Account locked after repeated failures; unlock time stated |
| `NGOIS-AUTH-0022` | 401 | MFA code required |
| `NGOIS-AUTH-0023` | 401 | MFA code invalid or reused |
| `NGOIS-AUTH-0024` | 403 | MFA enrolment required by policy before access |
| `NGOIS-AUTH-0025` | 403 | Account suspended |
| `NGOIS-AUTH-0026` | 403 | Invitation expired |
| `NGOIS-AUTH-0027` | 400 | Reset token invalid or already used |
| `NGOIS-AUTH-0050` | 403 | Step-up authentication required for this operation |
| `NGOIS-AUTH-0051` | 403 | Break-glass grant absent or expired |
| `NGOIS-AUTH-0052` | 403 | Session revoked; re-authentication required |
| `NGOIS-AUTH-0110` | 503 | Identity provider unavailable. **Existing sessions continue until expiry** |
| `NGOIS-AUTH-0111` | 502 | Tenant OIDC provider returned an error; local login remains available |
| `NGOIS-TEN-0020` | 409 | Tenant slug already in use |
| `NGOIS-TEN-0021` | 422 | Slug fails the format rule. **Immutable after provisioning**, because the payroll schema name derives from it |
| `NGOIS-TEN-0022` | 422 | **A Restricted personal data field was enabled without a DPO approval reference.** The rejection is the control working ([RB-05 §4.3](../runbooks/rb-05-tenant-onboarding.md)) |
| `NGOIS-TEN-0023` | 422 | A retention override attempted to **shorten** a statutory period |
| `NGOIS-TEN-0024` | 422 | A security setting was set below the platform floor |
| `NGOIS-TEN-0025` | 409 | Tenant is suspended; the operation is read-only |
| `NGOIS-TEN-0026` | 409 | Tenant is offboarding; writes are closed |
| `NGOIS-TEN-0070` | 409 | Provisioning already in progress |
| `NGOIS-TEN-0071` | 429 | A full export was already requested in the last 24 hours |
| `NGOIS-TEN-0072` | 507 | Storage quota exceeded |
| `NGOIS-TEN-0130` | 500 | **Provisioning failed partway.** Re-run the job; do **not** complete the remaining steps manually ([RB-05](../runbooks/rb-05-tenant-onboarding.md)) |

---

## E.4 `GRANT` and `FIN`

| Code | HTTP | Meaning |
| --- | --- | --- |
| `NGOIS-GRANT-0009` | 409 | Grant reference not unique for this tenant and donor |
| `NGOIS-GRANT-0012` | 422 | `end_date` before `start_date`, or a period change would orphan reporting periods |
| `NGOIS-GRANT-0021` | 422 | **Cumulative disbursements would exceed the grant ceiling.** The remaining amount is stated ([30 FS-03](../30-quality-attributes-nfr.md)) |
| `NGOIS-GRANT-0027` | 422 | Disbursement currency differs from the grant currency without an explicit rate and provenance |
| `NGOIS-GRANT-0033` | 422 | Budget line totals do not reconcile to the grant total; the discrepancy is stated |
| `NGOIS-GRANT-0034` | 422 | Expenditure exceeds the budget line |
| `NGOIS-GRANT-0035` | 422 | Budget revision not approved; it is inert until approved |
| `NGOIS-GRANT-0044` | 409 | Grant is closed; no new disbursements or expenditure |
| `NGOIS-GRANT-0045` | 409 | Disbursement already approved |
| `NGOIS-GRANT-0046` | 422 | A reversal must reference a paid disbursement |
| `NGOIS-GRANT-0051` | 403 | **Maker-checker: the approver cannot be the preparer.** Also enforced by database constraint ([Appendix C §C.4](c-rbac-matrix.md)) |
| `NGOIS-GRANT-0052` | 403 | Grant outside the actor's scope |
| `NGOIS-GRANT-0053` | 403 | Field not visible to a `donor_viewer` |
| `NGOIS-GRANT-0060` | 422 | IATI publication blocked: **the exclusion policy would be violated**, or a cohort falls below k = 5 ([12 §12.4.3](../12-integration-architecture.md)) |
| `NGOIS-GRANT-0061` | 422 | IATI activity identifier is immutable once published |
| `NGOIS-FIN-0100` | 422 | No exchange rate available for the currency pair |
| `NGOIS-FIN-0101` | 502 | FX rate provider unavailable; the last known rate and its age are returned |
| `NGOIS-FIN-0102` | 422 | A manual rate override requires a recorded justification |
| `NGOIS-FIN-0110` | 502 | Payment provider unavailable. **The payment was not initiated** — stated explicitly so nobody retries a possibly-completed payment ([RB-15 §5.3](../runbooks/rb-15-integration-failure.md)) |
| `NGOIS-FIN-0111` | 409 | Payment provider reports this idempotency key as already processed |
| `NGOIS-FIN-0112` | 400 | Bank webhook signature invalid. **Logged as a security event** |

---

## E.5 `HR` and `PAY`

| Code | HTTP | Meaning |
| --- | --- | --- |
| `NGOIS-HR-0009` | 409 | Employee number not unique for this tenant |
| `NGOIS-HR-0020` | 422 | Contract dates overlap an existing active contract |
| `NGOIS-HR-0021` | 422 | Termination date precedes the hire date |
| `NGOIS-HR-0022` | 422 | Leave request exceeds the available balance |
| `NGOIS-HR-0023` | 409 | Leave request overlaps an approved absence |
| `NGOIS-HR-0050` | 403 | Employee outside the actor's department scope |
| `NGOIS-HR-0051` | 403 | **`hr:employee:read_pii` required.** Reading a list does not require decrypting names |
| `NGOIS-HR-0052` | 403 | A leave approver cannot approve their own request |
| `NGOIS-PAY-0020` | 409 | A run already exists for this tenant and period |
| `NGOIS-PAY-0021` | 409 | Run is not in a state permitting this operation |
| `NGOIS-PAY-0031` | 422 | **No effective tax band for the period.** Never a silent zero ([RB-01 §5.3](../runbooks/rb-01-failed-payroll-run.md)) |
| `NGOIS-PAY-0032` | 422 | **No exchange rate for a currency required by the run** |
| `NGOIS-PAY-0041` | 422 | Employee data incomplete: missing contract, tax number or bank detail. Affected employees are listed |
| `NGOIS-PAY-0052` | 500 | **An arithmetic or rounding assertion failed.** The run is stopped rather than producing a suspect figure ([RB-01 §5.6](../runbooks/rb-01-failed-payroll-run.md)) |
| `NGOIS-PAY-0053` | 500 | Run totals do not reconcile against the sum of records |
| `NGOIS-PAY-0055` | 403 | **Separation of duties: the approver cannot be the preparer.** Enforced by database constraint |
| `NGOIS-PAY-0056` | 403 | `payroll:run:approve` is not held by any role that can also submit |
| `NGOIS-PAY-0061` | 503 | Statement timeout or database error during calculation. The run is resumable |
| `NGOIS-PAY-0070` | 409 | Run already approved; a change requires a reversal |
| `NGOIS-PAY-0071` | 409 | A reversal already exists |
| `NGOIS-PAY-0103` | 422 | **A statutory contribution rule is missing for the period.** The missing rule and period are named |
| `NGOIS-PAY-0117` | 422 | **The exchange rate is older than 7 days.** The run is blocked; the age is stated ([12 §12.6](../12-integration-architecture.md)) |
| `NGOIS-PAY-0118` | 422 | The pinned ruleset hash no longer matches, so the run is not reproducible as recorded |

`NGOIS-PAY-0052` returns 500 deliberately. An arithmetic assertion failure is an internal defect, not a client error, and presenting it as a validation problem would invite someone to "correct the input" and re-run against a broken calculation.

---

## E.6 `BEN` and `FLD`

| Code | HTTP | Meaning |
| --- | --- | --- |
| `NGOIS-BEN-0020` | 422 | Required minimum registration fields absent |
| `NGOIS-BEN-0021` | 422 | A field not enabled for this tenant was supplied. **Restricted fields require DPO approval** |
| `NGOIS-BEN-0022` | 409 | Beneficiary code already in use |
| `NGOIS-BEN-0030` | 409 | **A probable duplicate was detected.** The submission is accepted and flagged; it is **not** rejected and **not** merged ([13 §13.6](../13-offline-first-architecture.md)) |
| `NGOIS-BEN-0031` | 422 | A merge requires a recorded human decision and rationale |
| `NGOIS-BEN-0032` | 409 | Beneficiary already erased; the record is a tombstone |
| `NGOIS-BEN-0040` | 422 | Consent absent for the stated purpose |
| `NGOIS-BEN-0041` | 422 | Consent withdrawn; processing for this purpose is not permitted |
| `NGOIS-BEN-0044` | 422 | **An erasure approver cannot be the person who recorded the request**, or an acknowledgement is absent ([RB-07 §5.3](../runbooks/rb-07-pii-erasure-request.md)) |
| `NGOIS-BEN-0045` | 409 | Erasure blocked by a legal hold. **The response describes the partial erasure available** rather than simply refusing |
| `NGOIS-BEN-0050` | 403 | Beneficiary outside the actor's assigned programmes or locations |
| `NGOIS-BEN-0051` | 403 | **`beneficiary:record:read_pii` required, with a stated purpose.** A read without a purpose is rejected |
| `NGOIS-BEN-0052` | 403 | Bulk export not permitted for this role |
| `NGOIS-BEN-0060` | 422 | A vulnerability score cannot be used to automate exclusion. **Advisory only** |
| `NGOIS-FLD-0020` | 422 | Submission does not satisfy the form's validation rules at capture version |
| `NGOIS-FLD-0021` | 422 | An unknown field was submitted for this form version |
| `NGOIS-FLD-0031` | 422 | **Submission against an unrecognised form version.** This should normally be accepted; a rejection is a defect ([RB-16 §6.3](../runbooks/rb-16-sync-failure.md)) |
| `NGOIS-FLD-0042` | 422 | Field validation failure. **Do not reject days of captured work over a newly-tightened rule** |
| `NGOIS-FLD-0050` | 403 | Form not assigned to this officer, or outside their location |
| `NGOIS-FLD-0051` | 403 | Device not registered, or registration revoked |
| `NGOIS-FLD-0070` | 409 | `client_uuid` already received. **Handled transparently; a surfaced 409 is a defect** |
| `NGOIS-FLD-0071` | 413 | Sync batch above the accepted size; the client should chunk |
| `NGOIS-FLD-0072` | 429 | Concurrent sync sessions for this tenant at the cap. **Queued, not rejected** — a field officer is never blocked |
| `NGOIS-FLD-0080` | 409 | A conflict requires tenant review; the platform will not resolve it |
| `NGOIS-FLD-0130` | 503 | Sync temporarily unavailable. **Data remains on the device and retrying is safe** — the message says so explicitly |

`NGOIS-FLD-0130`'s message text is prescribed rather than left to the implementer, because it is the message a field officer sees during an incident, and the wrong wording prompts exactly the app-reinstall behaviour that destroys unsynced data ([32](../32-risk-register.md) R-17).

---

## E.7 `LMS`, `RPT`, `FILE`, `NOTIF`, `INTEG`

| Code | HTTP | Meaning |
| --- | --- | --- |
| `NGOIS-LMS-0020` | 422 | Enrolment already exists for this user and course version |
| `NGOIS-LMS-0021` | 409 | Course not published |
| `NGOIS-LMS-0022` | 422 | Assessment attempts exhausted |
| `NGOIS-LMS-0023` | 409 | Prerequisite module incomplete |
| `NGOIS-LMS-0050` | 403 | Progress may only be recorded for the acting user |
| `NGOIS-RPT-0020` | 422 | Report parameters invalid for this definition |
| `NGOIS-RPT-0070` | 429 | Concurrent report generations at the tenant cap; **queue position is returned** |
| `NGOIS-RPT-0071` | 429 | Daily report-minute quota exhausted; deferred to tomorrow |
| `NGOIS-RPT-0072` | 429 | Daily export row quota exceeded |
| `NGOIS-RPT-0130` | 500 | Generation failed; the partial artefact is discarded, never delivered |
| `NGOIS-FILE-0020` | 422 | MIME type not permitted |
| `NGOIS-FILE-0021` | 413 | File above the size limit |
| `NGOIS-FILE-0030` | 409 | **Scan not yet complete; the file is not downloadable** |
| `NGOIS-FILE-0031` | 422 | Scan returned a malware verdict; the upload is rejected and logged |
| `NGOIS-FILE-0050` | 403 | File outside the actor's scope |
| `NGOIS-FILE-0070` | 410 | Signed URL expired |
| `NGOIS-NOTIF-0020` | 422 | Recipient has no usable contact detail for this channel |
| `NGOIS-NOTIF-0044` | 422 | **Template render failed: a required variable was absent.** The commonest cause of a notification dead-letter entry ([11 §11.7](../11-event-driven-architecture.md)) |
| `NGOIS-NOTIF-0070` | 429 | Daily notification quota reached; digested |
| `NGOIS-NOTIF-0110` | 502 | Email provider unavailable; queued for retry |
| `NGOIS-NOTIF-0111` | 502 | SMS provider unavailable; queued for retry |
| `NGOIS-INTEG-0110` | 502 | Provider returned an error; the provider and operation are named |
| `NGOIS-INTEG-0111` | 503 | Circuit breaker open; **the documented degradation is described in the response** |
| `NGOIS-INTEG-0112` | 422 | Webhook destination rejected: **not HTTPS, or resolves to a private address** — an SSRF control ([34 §34.2.2](../34-future-extensibility.md)) |
| `NGOIS-INTEG-0113` | 422 | IATI validation failed against v2.03; the schema errors are returned |

---

## E.8 `AI` and `DB`

| Code | HTTP | Meaning |
| --- | --- | --- |
| `NGOIS-AI-0001` | 400 | Prompt parameters invalid for this insight type |
| `NGOIS-AI-0002` | 422 | **Requested context exceeds the Internal classification ceiling.** The classification gate rejected it |
| `NGOIS-AI-0003` | 422 | **Post-redaction verification failed.** The request is rejected and **logged as a policy violation**, alerted if repeated ([18 §18.5](../18-ai-llm-architecture.md)) |
| `NGOIS-AI-0004` | 422 | Insufficient data: the aggregate cohort is below k = 5 |
| `NGOIS-AI-0005` | 429 | **Monthly token budget exhausted.** Every workflow continues manually; requests are never silently dropped or degraded ([18 §18.9](../18-ai-llm-architecture.md)) |
| `NGOIS-AI-0006` | 403 | The AI module is disabled for this tenant |
| `NGOIS-AI-0020` | 422 | Output failed the citation guardrail: an unverifiable figure was produced |
| `NGOIS-AI-0021` | 422 | Output failed the numeric cross-check against source aggregates |
| `NGOIS-AI-0022` | 409 | **This output is a draft and requires human approval before use** |
| `NGOIS-AI-0023` | 403 | An AI output may not be written to a decision field about a person ([ADR-0010](../adr/0010-llm-provider-and-boundaries.md), AI-3) |
| `NGOIS-AI-0110` | 502 | Provider unavailable; **the feature degrades cleanly and the manual path is offered** |
| `NGOIS-AI-0111` | 429 | Provider rate limit; retry scheduled |
| `NGOIS-DB-0001` | 409 | **Optimistic concurrency conflict**, raised by the version trigger. Surfaced as `NGOIS-API-0011` |
| `NGOIS-DB-0002` | 403 | **An append-only table rejected an `UPDATE` or `DELETE`.** Raised by trigger; reaching a client means a defect, and it is logged as a security event |
| `NGOIS-DB-0003` | 500 | **Tenant context was not set on the connection.** RLS returned zero rows. **Pages immediately** — this is the highest-severity internal error in the platform ([29 §29.3.3](../29-multi-tenancy-and-tenant-lifecycle.md)) |

`NGOIS-DB-0003` deserves its own note. It is not merely an error but the detection mechanism for the most dangerous defect class in the architecture, and `ngois_db_rls_context_missing_total` must remain at zero ([30 SE-04](../30-quality-attributes-nfr.md)). A single occurrence is investigated as a potential isolation failure, not as a routine bug.

---

## E.9 Registry summary and governance

| Domain | Codes allocated | Security-logged | Referenced by a runbook |
| --- | --- | --- | --- |
| `API` | 22 | 1 | 3 |
| `AUTH` | 14 | 2 | 2 |
| `TEN` | 11 | 1 | 2 |
| `GRANT` / `FIN` | 20 | 1 | 2 |
| `HR` / `PAY` | 21 | — | 1 |
| `BEN` / `FLD` | 26 | — | 3 |
| `LMS` / `RPT` / `FILE` / `NOTIF` / `INTEG` | 24 | 2 | 2 |
| `AI` | 13 | 1 | — |
| `DB` | 3 | 2 | 1 |
| **Total** | **154** | **12** | — |

### E.9.1 Rules

| # | Rule |
| --- | --- |
| 1 | A code is never reused for a different meaning, and never deleted — only deprecated |
| 2 | A new code is allocated in API design review, at the same time as the endpoint ([35 §35.6](../35-engineering-standards.md)) |
| 3 | Every code has a documentation page at its `documentation_url`; a code without one fails the build |
| 4 | No `detail` or `remediation` text contains personal data |
| 5 | Every 403 names the required permission |
| 6 | A code referenced by a runbook decision table cannot change meaning without updating that runbook in the same change |
| 7 | The twelve security-logged codes emit an audit event and, where marked, an alert |
| 8 | Field-facing messages — `NGOIS-API-0006`, `NGOIS-FLD-0130` — have **prescribed wording**, because incorrect wording risks data loss on devices |

Rule 8 is unusual and worth keeping. Most error text is a matter of clarity; those two are a matter of whether a field officer's unsynced work survives the incident.
