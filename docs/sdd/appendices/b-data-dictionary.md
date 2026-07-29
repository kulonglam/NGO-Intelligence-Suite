# Appendix B — Data Dictionary

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Owner:** Data Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Source of truth:** [08](../08-database-schema.md) holds the DDL. This appendix is the column-level reference with classification, provenance and semantics.

---

## B.1 How to read this appendix

Every column carries four attributes beyond its type:

| Attribute | Meaning |
| --- | --- |
| **Class** | Data classification per [17 §17.4](../17-privacy-and-compliance.md): `Pub` public, `Int` internal, `Con` confidential, `Res` restricted |
| **Enc** | `Y` if encrypted at the application layer under a per-tenant key ([ADR-0015](../adr/0015-application-layer-pii-encryption.md)) |
| **Provenance** | Where the value comes from: `user` entered by a person, `sys` set by the platform, `calc` derived, `ext` from an external system, `device` captured offline |
| **Retention** | The governing retention rule from [09 §9.6](../09-data-management-strategy.md) |

`Res` fields are additionally purpose-logged on every read ([17 §17.6](../17-privacy-and-compliance.md)).

### B.1.1 Standard columns

Present on every tenant-owned table unless stated. Not repeated in the per-table listings.

| Column | Type | Class | Provenance | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` PK | Int | sys | `gen_random_uuid()`. Never sequential, so an identifier does not leak volume or ordering |
| `tenant_id` | `uuid` NOT NULL | Int | sys | FK to `tenants`. **The RLS predicate column.** Leading column of nearly every index |
| `created_at` | `timestamptz` NOT NULL | Int | sys | `now()` at insert. UTC always |
| `updated_at` | `timestamptz` NOT NULL | Int | sys | Maintained by the `set_updated_at()` trigger, never by application code |
| `created_by` | `uuid` NULL | Int | sys | FK to `users`. `NULL` for system-originated rows |
| `updated_by` | `uuid` NULL | Int | sys | FK to `users` |
| `deleted_at` | `timestamptz` NULL | Int | sys | Soft delete. **Every query must filter it**; partial indexes are defined `WHERE deleted_at IS NULL` |
| `version` | `integer` NOT NULL | Int | sys | Optimistic concurrency, surfaced as an ETag ([10 §10.8](../10-api-design-standards.md)) |

### B.1.2 Type conventions

| Concern | Convention | Reason |
| --- | --- | --- |
| Money | `NUMERIC(15,2)` with a separate `..._currency CHAR(3)` | Exact arithmetic; no floating point anywhere in a money path ([30 FS-04](../30-quality-attributes-nfr.md)) |
| Currency | `CHAR(3)`, ISO-4217, checked against a reference table | No amount exists without a currency |
| Percentages and rates | `NUMERIC(9,6)` | Tax rates need six decimal places to avoid rounding drift across bands |
| Timestamps | `timestamptz`, UTC | Never `timestamp`. Local time is a presentation concern |
| Dates without time | `date` | Birth dates, contract dates, periods |
| Encrypted values | `BYTEA` named `..._encrypted` | Holds ciphertext, nonce and auth tag |
| Blind indexes | `BYTEA` named `..._index` | HMAC for exact-match lookup only |
| Free text | `text`, never `varchar(n)` | No arbitrary limits; length constrained by `CHECK` where meaningful |
| Enumerations | PostgreSQL `ENUM` for closed stable sets, `text` + FK for extensible ones | An enum change requires a migration, which is the correct friction for a closed set |
| Flexible attributes | `jsonb` with a validating `CHECK` or application-level schema | Used only where the shape is genuinely dynamic, e.g. submission values |
| Identifiers from external systems | `text`, with a unique constraint scoped to tenant and system | Never used as a primary key |

---

## B.2 Platform and tenancy

### `tenants` — the tenant register. **Not** tenant-owned; platform-scoped, no RLS

| Column | Type | Class | Enc | Prov | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` PK | Int | | sys | Referenced by every tenant-owned table |
| `slug` | `text` UNIQUE | Int | | sys | Lowercase, `[a-z0-9_]`, immutable. **Used to construct the payroll schema name**, so it can never change after provisioning |
| `legal_name` | `text` | Int | | user | |
| `display_name` | `text` | Int | | user | |
| `country_code` | `char(2)` | Int | | user | ISO-3166. Drives statutory defaults and residency |
| `primary_currency` | `char(3)` | Int | | user | ISO-4217 |
| `timezone` | `text` | Int | | user | IANA name |
| `status` | `tenant_status` | Int | | sys | `provisioning`, `active`, `suspended`, `offboarding`, `deleted` ([29 §29.7](../29-multi-tenancy-and-tenant-lifecycle.md)) |
| `suspension_reason` | `text` NULL | Int | | user | Distinguishes a commercial suspension, which is read-only, from a security suspension, which is not |
| `kms_key_name` | `text` | Con | | sys | Resource name of the tenant's key encryption key. **Not a secret**, but its absence makes all PII unreadable |
| `payroll_schema` | `text` NULL | Int | | sys | `tenant_<slug>`. `NULL` until the HR module is enabled |
| `enabled_modules` | `text[]` | Int | | sys | |
| `rate_tier` | `text` | Int | | sys | Drives gateway rate limits ([29 §29.5](../29-multi-tenancy-and-tenant-lifecycle.md)) |
| `data_region` | `text` | Int | | sys | Residency commitment ([17 §17.10](../17-privacy-and-compliance.md)) |
| `retention_overrides` | `jsonb` | Int | | user | May only **lengthen** a statutory period, never shorten it |
| `activated_at`, `suspended_at`, `offboarding_started_at`, `deleted_at` | `timestamptz` NULL | Int | | sys | Lifecycle timestamps |

### `users`

| Column | Type | Class | Enc | Prov | Notes |
| --- | --- | --- | --- | --- | --- |
| `auth_provider_id` | `text` UNIQUE | Int | | ext | The Supabase Auth subject. **Credentials are never stored here** ([ADR-0004](../adr/0004-supabase-auth-as-identity-provider.md)) |
| `email` | `text` | Con | | user | Lowercased. Unique per tenant, not globally — one person may work for two tenants |
| `full_name_encrypted` | `bytea` | Res | Y | user | Staff PII |
| `phone_encrypted` | `bytea` NULL | Res | Y | user | |
| `phone_index` | `bytea` NULL | Con | | calc | Blind index for lookup |
| `locale` | `text` | Int | | user | `en`, `ar`, `sw` |
| `status` | `user_status` | Int | | sys | `invited`, `active`, `suspended`, `deactivated` |
| `mfa_required` | `boolean` | Int | | sys | Derived from role; a tenant may raise this, never lower it |
| `last_login_at` | `timestamptz` NULL | Int | | sys | |
| `failed_login_count` | `integer` | Int | | sys | Reset on success; drives lockout |

### `roles`, `permissions`, `role_permissions`, `user_roles`

| Table | Purpose | Notes |
| --- | --- | --- |
| `roles` | The eight roles ([15 §15.1.2](../15-rbac-and-authorization.md)) | Platform-defined. `is_system` prevents a tenant from editing a role's meaning |
| `permissions` | The permission catalogue | `resource:sub_resource:action`, e.g. `grant:disbursement:approve` |
| `role_permissions` | The matrix | The generated authorisation tests derive from this table ([Appendix C](c-rbac-matrix.md)) |
| `user_roles` | Assignment, with optional scope | `scope_type` and `scope_ids` implement record-level restriction — a `field_officer`'s assignment, a `donor_viewer`'s grant allow-list |

### `sessions`, `mfa_enrollments`, `login_attempts`

| Notable column | Notes |
| --- | --- |
| `sessions.refresh_token_hash` | Hash only, never the token |
| `sessions.revoked_at`, `revocation_reason` | Supports immediate invalidation on role change, suspension or incident ([14 §14.2.5](../14-security-architecture.md)) |
| `sessions.device_id` | Links a session to a registered field device |
| `mfa_enrollments.secret_encrypted` | Encrypted; a TOTP secret is a credential |
| `login_attempts.ip_address`, `user_agent` | `Con`. Retained 90 days, then aggregated. Used for anomaly detection |
| `login_attempts.email_attempted` | `Con`. Stored even for a non-existent account, for attack visibility |

---

## B.3 Grants and finance

### `grants`

| Column | Type | Class | Prov | Notes |
| --- | --- | --- | --- | --- |
| `donor_id` | `uuid` | Int | user | FK `donors` |
| `reference` | `text` | Int | user | The donor's award reference. Unique per tenant and donor |
| `title` | `text` | Int | user | |
| `status` | `grant_status` | Int | sys | `draft`, `pending`, `active`, `suspended`, `closed`, `cancelled`. Transitions are validated in the service, not free-form |
| `total_amount` | `numeric(15,2)` | Con | user | **The disbursement ceiling.** No disbursement may take the approved total beyond it ([30 FS-03](../30-quality-attributes-nfr.md)) |
| `currency` | `char(3)` | Int | user | The grant's currency, which may differ from the tenant's |
| `start_date`, `end_date` | `date` | Int | user | `CHECK (end_date >= start_date)` |
| `dac_sector_code` | `text` NULL | Pub | user | Published to IATI |
| `iati_activity_id` | `text` NULL | Pub | sys | Assigned on first publication; **immutable thereafter**, because IATI consumers key on it |
| `iati_publish_enabled` | `boolean` | Int | user | Per-grant opt-in. The exclusion policy still applies ([12 §12.4.3](../12-integration-architecture.md)) |
| `compliance_score` | `numeric(5,2)` NULL | Int | calc | Recomputed nightly ([Appendix I §I.4](i-algorithms.md)) |

### `grant_budgets`, `budget_lines`

| Notable column | Notes |
| --- | --- |
| `grant_budgets.revision` | Budgets are versioned, never edited in place. A donor-approved revision is a new row |
| `grant_budgets.approved_by`, `approved_at` | A revision is inert until approved |
| `budget_lines.dac_code`, `cost_category` | Drives donor reporting |
| `budget_lines.amount` | `Con`. The sum across lines must equal the budget total, enforced by a deferred constraint |

### `disbursements`

The most control-heavy table in the platform.

| Column | Type | Class | Prov | Notes |
| --- | --- | --- | --- | --- |
| `grant_id`, `budget_line_id` | `uuid` | Int | user | |
| `amount`, `currency` | `numeric(15,2)`, `char(3)` | Con | user | |
| `fx_rate`, `fx_rate_date`, `amount_base` | `numeric(15,6)`, `date`, `numeric(15,2)` | Con | calc | **The rate is stored with the transaction and never retrospectively re-applied** ([32](../32-risk-register.md) R-45) |
| `status` | `disbursement_status` | Int | sys | `draft`, `pending_approval`, `approved`, `paid`, `failed`, `reversed` |
| `prepared_by` | `uuid` | Int | sys | |
| `approved_by` | `uuid` NULL | Int | sys | **`CHECK (approved_by <> prepared_by)`** — maker-checker enforced by the database, not the application ([30 SE-06](../30-quality-attributes-nfr.md)) |
| `payment_method` | `payment_method` | Int | user | `bank_transfer`, `mobile_money`, `cheque`, `cash` |
| `payment_reference` | `text` NULL | Con | ext | From the provider |
| `idempotency_key` | `text` NULL | Int | sys | Prevents duplicate initiation to a payment provider ([32](../32-risk-register.md) R-25) |
| `recipient_details_encrypted` | `bytea` NULL | Res | user | Bank or mobile money details. Encrypted |
| `reversal_of` | `uuid` NULL | Int | sys | A reversal is a new row, never an update. The original remains for audit |

### `expenditures`, `grant_reports`, `grant_report_periods`, `grant_activities`, `grant_compliance_snapshots`

| Table | Notes |
| --- | --- |
| `expenditures` | Actual spend against budget lines. `receipt_file_id` links to `file_objects` |
| `grant_report_periods` | Generated from the grant's reporting schedule; drives the overdue alerting |
| `grant_reports` | `narrative` is `Int` and may contain the AI-drafted text; `ai_generation_id` provides internal traceability of AI assistance ([ADR-0010](../adr/0010-llm-provider-and-boundaries.md)) |
| `grant_activities` | The link between a grant and the field activities delivering it |
| `grant_compliance_snapshots` | Append-only history of the compliance score, so a change is explainable after the fact |

### `fx_rates`

| Column | Notes |
| --- | --- |
| `base_currency`, `quote_currency`, `rate`, `rate_date` | Unique on the triple |
| `source`, `fetched_at` | **`fetched_at` drives the staleness alert.** A stale rate is a SEV-2 because it produces silently wrong numbers ([RB-15](../runbooks/rb-15-integration-failure.md)) |

---

## B.4 HR and payroll

### `employees` — shared schema, RLS

| Column | Type | Class | Enc | Prov | Notes |
| --- | --- | --- | --- | --- | --- |
| `employee_number` | `text` | Int | | user | Unique per tenant |
| `first_name_encrypted`, `last_name_encrypted` | `bytea` | Res | Y | user | |
| `name_index` | `bytea` | Con | | calc | Blind index. **This is why employee search is exact-match** ([ADR-0015](../adr/0015-application-layer-pii-encryption.md)) |
| `national_id_encrypted` | `bytea` NULL | Res | Y | user | Also the tax identifier in both jurisdictions |
| `date_of_birth_encrypted` | `bytea` NULL | Res | Y | user | |
| `gender` | `text` NULL | Con | | user | Optional. Collected for statutory reporting only |
| `phone_encrypted`, `email` | `bytea`, `text` | Res / Con | Y / | user | |
| `bank_details_encrypted` | `bytea` NULL | Res | Y | user | Account number and branch |
| `tax_number_encrypted` | `bytea` NULL | Res | Y | user | |
| `social_security_number_encrypted` | `bytea` NULL | Res | Y | user | NSIF or NSSF |
| `department_id`, `position_id` | `uuid` | Int | | user | |
| `status` | `employment_status` | Int | | sys | `active`, `on_leave`, `suspended`, `terminated` |
| `hire_date`, `termination_date` | `date` | Int | | user | `termination_date` triggers the urgent access-revocation event |
| `user_id` | `uuid` NULL | Int | | sys | Links an employee to a platform login where they have one |

### `contracts`

| Notable column | Notes |
| --- | --- |
| `gross_salary`, `currency` | `Res`. Salary is restricted, not merely confidential |
| `salary_period` | `monthly`, `annual`, `daily` |
| `grant_id`, `cost_centre_id` | Cost allocation of staff time to grants — a frequent donor requirement |
| `allowances` | `jsonb`, each entry typed and flagged taxable or not, because taxability changes the PAYE base |
| `end_date` | Drives the expiry notification |

### `tax_bands`, `statutory_contribution_rates` — **global, no RLS, tenant read-only**

| Column | Notes |
| --- | --- |
| `country_code`, `effective_from`, `effective_to` | Effective-dated. A historical run uses the rules in force at the time |
| `lower_bound`, `upper_bound`, `rate`, `fixed_amount` | `NUMERIC(9,6)` on the rate |
| `contribution_type` | `employee`, `employer` |
| `basis` | Which earnings the rate applies to; the reason the calculation engine needs a component model rather than a formula ([ADR-0019](../adr/0019-narrow-extension-points.md)) |
| `source_reference` | **Citation to the statute or gazette.** Mandatory. Correct arithmetic on a misread statute is still wrong ([31 §31.4.2](../31-implementation-roadmap.md)) |
| `ruleset_hash` | Hash of the effective rule set, pinned by each payroll run |

A tenant cannot write these tables. That is a deliberate constraint, not an oversight ([29 §29.6](../29-multi-tenancy-and-tenant-lifecycle.md)).

### `payroll_runs` — **`tenant_<slug>` schema** ([ADR-0006](../adr/0006-per-tenant-schema-for-payroll.md))

| Column | Type | Class | Prov | Notes |
| --- | --- | --- | --- | --- |
| `period_year`, `period_month` | `integer` | Int | user | Unique per tenant and period, excluding reversed runs |
| `status` | `payroll_run_status` | Int | sys | `draft`, `calculating`, `calculated`, `pending_approval`, `approved`, `paid`, `failed`, `reversed` |
| `ruleset_hash` | `text` | Int | sys | **Pins the statutory rules used.** Recomputation with the same hash must be byte-identical ([30 FS-02](../30-quality-attributes-nfr.md)) |
| `fx_rate_set` | `jsonb` | Int | sys | Rates frozen at calculation time |
| `prepared_by` | `uuid` | Int | sys | |
| `approved_by` | `uuid` NULL | Int | sys | **`CHECK (approved_by <> prepared_by)`** |
| `total_gross`, `total_deductions`, `total_net`, `total_employer_cost` | `numeric(15,2)` | Res | calc | Must reconcile against the sum of records, verified after every run |
| `failure_reason`, `failed_at_stage` | `text` NULL | Int | sys | Drives the classification in [RB-01](../runbooks/rb-01-failed-payroll-run.md) |
| `reversal_of` | `uuid` NULL | Int | sys | A reversal is a new run |

### `payroll_records`, `payroll_record_lines`, `payroll_cost_allocations`

| Table | Notes |
| --- | --- |
| `payroll_records` | One per employee per run. `gross`, `total_deductions`, `net` are `Res` |
| `payroll_record_lines` | **The itemisation, and the audit trail of the calculation.** Each line has a `component_code`, `basis_amount`, `rate_applied`, `amount` and a `source_reference` to the rule that produced it. This is what makes a payslip explainable and a dispute answerable |
| `payroll_cost_allocations` | Splits an employee's cost across grants and cost centres |

---

## B.5 Beneficiaries and programmes

The most sensitive data in the platform. Every personal field is encrypted, restricted and purpose-logged.

### `beneficiaries`

| Column | Type | Class | Enc | Prov | Notes |
| --- | --- | --- | --- | --- | --- |
| `beneficiary_code` | `text` | Int | | sys | Tenant-scoped. **The only identifier used in reports, exports and support conversations** |
| `household_id` | `uuid` NULL | Int | | user | |
| `first_name_encrypted`, `last_name_encrypted` | `bytea` | Res | Y | user/device | |
| `name_index` | `bytea` | Con | | calc | Blind index; input to deduplication ([Appendix I §I.5](i-algorithms.md)) |
| `date_of_birth_encrypted` | `bytea` NULL | Res | Y | user/device | |
| `birth_year` | `integer` NULL | Con | | calc | Retained unencrypted for age-band aggregation, which would otherwise require decrypting every record to build a report |
| `sex` | `text` NULL | Con | | user | Required for statutory and donor disaggregation |
| `disability_status` | `text` NULL | Res | | user | |
| `national_id_encrypted` | `bytea` NULL | Res | Y | user | Frequently absent — displacement means documents are lost, and the platform must work without them |
| `phone_encrypted` | `bytea` NULL | Res | Y | user | |
| `location_precise_encrypted` | `bytea` NULL | Res | Y | device | GPS coordinates. **Encrypted because precise location is the field most capable of causing physical harm** |
| `location_admin_area_id` | `uuid` | Con | | user | Coarse administrative area, unencrypted, used for aggregation. The precision boundary is deliberate |
| `vulnerability_score` | `numeric(5,2)` NULL | Res | | calc | Deterministic and explainable. **Advisory only; never automates exclusion** ([Appendix I §I.2](i-algorithms.md)) |
| `vulnerability_factors` | `jsonb` NULL | Res | | calc | The contributing factors, so a score can be explained to the person it concerns |
| `status` | `beneficiary_status` | Int | | sys | `active`, `inactive`, `exited`, `deceased`, `erased` |
| `erased_at`, `erasure_request_id` | `timestamptz`, `uuid` NULL | Int | | sys | Set by tombstoning. **The record persists de-identified for donor audit** ([RB-07](../runbooks/rb-07-pii-erasure-request.md)) |
| `duplicate_of` | `uuid` NULL | Int | | user | Set only after human review. Never automatically |

Fields deliberately **not** present: ethnicity, religion, political affiliation, and any protected characteristic. A tenant may enable one only through the six-question gate with DPO approval ([17 §17.6.1](../17-privacy-and-compliance.md)), and it is recorded as an exception.

### `households`, `vulnerability_assessments`, `beneficiary_consents`, `beneficiary_merge_log`

| Table | Notes |
| --- | --- |
| `households` | `size`, `dependents_count`, `head_beneficiary_id`. `location_precise_encrypted` as above |
| `vulnerability_assessments` | Append-only. Each assessment retains the `scoring_model_version` used, so a historical score is explainable even after the model changes |
| `beneficiary_consents` | `purpose`, `basis`, `given_at`, `withdrawn_at`, `evidence_file_id`. Consent is per purpose, not global |
| `beneficiary_merge_log` | Append-only record of every merge: who, when, which records, and the decision rationale. A merge can erase an entitlement, so it is fully accountable |

### `programmes`, `programme_enrollments`, `programme_activities`, `attendance_records`

| Table | Notes |
| --- | --- |
| `programmes` | Links to `grant_id`. `target_reach` for indicator tracking |
| `programme_enrollments` | `enrolled_at`, `exited_at`, `exit_reason`. **Office-authoritative for conflict purposes** — a device may not change an entitlement ([ADR-0005](../adr/0005-offline-conflict-resolution-policy.md)) |
| `programme_activities` | A distribution, training or service delivery event |
| `attendance_records` | **Append-only**, `client_uuid` for idempotency. The dominant volume table in the field domain |

---

## B.6 Field data

### `form_templates`, `form_template_versions`, `form_fields`, `field_validation_rules`, `form_assignments`

| Notable column | Notes |
| --- | --- |
| `form_template_versions.version` | **A submission binds permanently to the version captured against.** Republishing must never invalidate collected data ([RB-16 §6.3](../runbooks/rb-16-sync-failure.md)) |
| `form_fields.field_type` | From a **closed catalogue**. An open type would mean unvalidatable data ([34 §34.2.3](../34-future-extensibility.md)) |
| `form_fields.contains_personal_data` | **When true, the field automatically inherits encryption, classification and retention.** A tenant cannot create an unprotected PII field |
| `form_fields.classification` | Defaults from `contains_personal_data`; may be raised, never lowered |
| `form_assignments` | Which officers may submit which form, in which locations |

### `submissions`

| Column | Type | Class | Prov | Notes |
| --- | --- | --- | --- | --- |
| `client_uuid` | `uuid` | Int | device | Generated on the device. **Unique per tenant; the idempotency key for sync.** A resubmission is recognised, not duplicated |
| `form_version_id` | `uuid` | Int | device | The binding described above |
| `captured_at` | `timestamptz` | Int | device | **When the officer recorded it.** Corrected for device clock skew. Used for all ordering semantics |
| `received_at` | `timestamptz` | Int | sys | When the server accepted it. **Operational only, never semantic** — the distinction is load-bearing ([ADR-0005](../adr/0005-offline-conflict-resolution-policy.md)) |
| `device_id`, `sync_session_id` | `uuid` | Int | sys | |
| `submitted_by` | `uuid` | Int | sys | |
| `location_captured_encrypted` | `bytea` NULL | Res | device | |
| `review_status` | `submission_review_status` | Int | sys | `accepted`, `pending_review`, `flagged_duplicate`, `rejected`. **Nothing is silently dropped** |
| `beneficiary_id` | `uuid` NULL | Int | calc | Linked after review where applicable |
| `client_app_version` | `text` | Int | device | **The column that makes a client-version comparison possible during a sync incident** ([RB-16 §6.4](../runbooks/rb-16-sync-failure.md)) |

### `submission_values`, `submission_attachments`, `submission_review_queue`, `sync_sessions`

| Table | Notes |
| --- | --- |
| `submission_values` | One row per field. `value_text`, `value_numeric`, `value_date`, `value_json`, plus `value_encrypted` where the field is personal. Typed columns rather than a single text column, so validation and aggregation are possible |
| `submission_attachments` | `file_object_id`, `compressed_bytes`, `original_bytes`. Client-side compression is a bandwidth and cost control ([33 §33.6](../33-cost-model-and-finops.md)) |
| `submission_review_queue` | Conflicts and probable duplicates awaiting a **tenant** decision. The platform never resolves these ([RB-16 §6.5](../runbooks/rb-16-sync-failure.md)) |
| `sync_sessions` | `started_at`, `completed_at`, `batch_count`, `submission_count`, `result`, `bytes_transferred`, `client_clock_offset_seconds`. The source of the sync SLO and of `ngois_sync_queue_age_seconds` |

---

## B.7 Learning

| Table | Notes |
| --- | --- |
| `courses`, `course_versions`, `modules`, `lessons` | Content hierarchy. Versioned, so a completed course records the version completed |
| `assessments`, `questions`, `answer_options` | `answer_options.is_correct` is never sent to the client for an active assessment |
| `mandatory_training_rules` | Maps a position or department to required courses; drives automatic enrolment on onboarding |
| `lms_enrollments` | `Con`. Status, due date, completion. Training compliance is staff performance data |
| `lesson_progress`, `assessment_attempts` | `attempts_count`, `score`, `passed_at`. Retained per policy, then aggregated |
| `certificates` | `certificate_number`, `issued_at`, `expires_at`, `verification_hash`. The hash allows a third party to verify a certificate without access to the platform |

---

## B.8 Cross-cutting tables

### `audit_events`

| Column | Type | Class | Notes |
| --- | --- | --- | --- |
| `sequence` | `bigint` | Int | Monotonic per tenant |
| `event_hash`, `previous_hash` | `bytea` | Int | **Hash chain.** Tampering breaks the chain and is detected by the verification job ([14 §14.7](../14-security-architecture.md)) |
| `actor_id`, `actor_role`, `actor_ip` | | Con | `actor_id` is `NULL` for system actions |
| `action`, `resource_type`, `resource_id` | `text`, `uuid` | Int | |
| `before_value`, `after_value` | `jsonb` NULL | **Res** | **May contain PII**, therefore encrypted and access-controlled to `auditor` and `org_admin` |
| `purpose` | `text` NULL | Int | **Why** a restricted field was read. Mandatory for `pii.read` actions ([17 §17.6](../17-privacy-and-compliance.md)) |
| `correlation_id` | `uuid` | Int | Ties the entry to a request and a trace |
| `break_glass_ticket` | `text` NULL | Int | Present on any action taken under emergency access |

Grants are append-only: the writing role holds `INSERT` and `SELECT`, never `UPDATE` or `DELETE`.

### `outbox_events`

| Column | Notes |
| --- | --- |
| `event_id` | `uuid`. **The consumer idempotency key** ([ADR-0011](../adr/0011-transactional-outbox.md)) |
| `stream`, `event_type`, `schema_version` | Routing and compatibility |
| `payload` | `jsonb`. **Never contains PII beyond identifiers** — a consumer fetches details through the authenticated API |
| `correlation_id`, `causation_id` | Captured at the source of truth |
| `published_at` | `NULL` until relayed. **`min(created_at) WHERE published_at IS NULL` is the relay health signal** ([RB-02 §5.2](../runbooks/rb-02-dlq-drain-and-replay.md)) |
| `attempt_count`, `last_error` | Diagnosis |

### `file_objects`, `notification_*`, `idempotency_keys`, `ai_generations`

| Table | Notes |
| --- | --- |
| `file_objects` | `storage_path` is **always tenant-prefixed**, constructed by a helper that takes the tenant from request context and accepts no tenant parameter. `scan_status` gates access; an unscanned file is not downloadable |
| `notification_templates` | Per locale, including Arabic |
| `notification_deliveries` | `recipient_encrypted`, `status`, `provider_message_id`, `attempt_count`. Body is not retained after successful delivery |
| `idempotency_keys` | `key`, `endpoint`, `request_hash`, `response_snapshot`, `expires_at`. **`request_hash` catches key reuse with a different body**, which is returned as a conflict rather than silently served the cached response ([10 §10.7](../10-api-design-standards.md)) |
| `ai_generations` | `prompt_version`, `model`, `input_token_count`, `output_token_count`, `cost_estimate`, `redaction_report`, `guardrail_results`, `approved_by`, `approved_at`. **`approved_by IS NULL` means the output is still a draft** and cannot be treated as final ([ADR-0010](../adr/0010-llm-provider-and-boundaries.md)). Contains **no** beneficiary PII by construction |

---

## B.9 Classification summary

| Class | Approximate column count | Encrypted | Purpose-logged | Examples |
| --- | --- | --- | --- | --- |
| **Restricted** | 41 | Yes | Yes | Beneficiary names, precise location, national ID, vulnerability score, salary, bank details, audit before/after values |
| **Confidential** | 78 | No | No | Email, blind indexes, coarse location, birth year, sex, financial totals, IP addresses |
| **Internal** | ~520 | No | No | Identifiers, statuses, dates, references, configuration |
| **Public** | 9 | No | No | DAC codes, IATI activity identifiers, published aggregates |

The 41 restricted columns are the platform's core risk surface. Adding a forty-second requires a recorded purpose and DPO approval before the migration is written ([34 §34.5](../34-future-extensibility.md), rule 2).

### B.9.1 The precision boundary

Worth stating explicitly, because it recurs across several tables: **precise values are encrypted, coarse derivatives are not.**

| Precise, encrypted | Coarse, plain | Why |
| --- | --- | --- |
| `location_precise_encrypted` | `location_admin_area_id` | Aggregation by district is safe; a GPS coordinate identifies a dwelling |
| `date_of_birth_encrypted` | `birth_year` | Age-band reporting is needed constantly; an exact birth date is identifying |
| `first_name_encrypted` + `last_name_encrypted` | `name_index` | Exact-match lookup without decryption |

Without this pattern, every aggregate report would decrypt every record — unacceptable both for cost and for the purpose-logging volume it would generate.
