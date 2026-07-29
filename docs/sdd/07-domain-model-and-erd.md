# 07 — Domain Model and Entity-Relationship Design

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Chapter:** 07 — Domain Model and ERD
> **Owner:** Data Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Related ADRs:** [ADR-0002](adr/0002-hybrid-multi-tenancy-with-rls.md), [ADR-0006](adr/0006-per-tenant-schema-for-payroll.md), [ADR-0011](adr/0011-transactional-outbox.md)

---

## 7.1 Bounded context map

Seven bounded contexts. The relationship type between each pair determines how they may integrate, and that determination is binding: a "customer/supplier" relationship means one context's model must accommodate the other's needs, while "anti-corruption layer" means the receiving side translates and never adopts the sender's terms.

```mermaid
flowchart TB
    Identity["<b>Identity and Access</b><br/>users, roles, permissions,<br/>sessions, tenants"]
    Grant["<b>Grant Management</b><br/>donors, grants, budgets,<br/>disbursements, activities"]
    People["<b>People Operations</b><br/>employees, contracts,<br/>payroll, leave"]
    Learning["<b>Learning</b><br/>courses, enrollments,<br/>assessments, certificates"]
    Beneficiary["<b>Beneficiary and Programme</b><br/>beneficiaries, households,<br/>programmes, attendance"]
    FieldData["<b>Field Data</b><br/>forms, submissions,<br/>validation, sync"]
    Platform["<b>Platform</b><br/>audit, files, notifications,<br/>integrations, analytics"]

    Identity -->|"upstream, conformist"| Grant
    Identity -->|"upstream, conformist"| People
    Identity -->|"upstream, conformist"| Beneficiary
    Identity -->|"upstream, conformist"| FieldData
    Identity -->|"upstream, conformist"| Learning
    People -->|"published language:<br/>hr.employee.onboarded"| Learning
    Grant -->|"shared kernel:<br/>grant_id on programmes"| Beneficiary
    FieldData -->|"customer/supplier"| Beneficiary
    FieldData -->|"published language:<br/>evidence linkage"| Grant
    People -->|"published language:<br/>staff cost attribution"| Grant
    Grant -.->|"events"| Platform
    People -.->|"events"| Platform
    Beneficiary -.->|"events"| Platform
    FieldData -.->|"events"| Platform
    Learning -.->|"events"| Platform
```

| Relationship | Contexts | Meaning and constraint |
| --- | --- | --- |
| Upstream / conformist | Identity → all | Every context accepts Identity's notion of user and tenant without translation. Identity does not accommodate downstream needs; downstream conforms |
| Published language | People → Learning, People → Grant, FieldData → Grant | Integration happens through a stable, versioned event contract. Neither side reads the other's tables. The event schema is the contract and changes additively |
| Shared kernel | Grant ↔ Beneficiary | `grant_id` appears on `programmes` so burn rate can be attributed to served populations. This is the only shared identifier across these contexts and any expansion of it requires an ADR, because shared kernels are the most expensive coupling to unwind |
| Customer / supplier | FieldData → Beneficiary | FieldData is the customer: Beneficiary exposes duplicate-check and upsert operations shaped for FieldData's needs, and prioritises them |
| Event sink | All → Platform | Platform contexts consume events and never call back. This asymmetry is what keeps audit, analytics and notification off the critical path |

### 7.1.1 The `enrollment` collision

The clearest illustration of why contexts matter. Both Learning and Beneficiary have an "enrollment", and they are unrelated concepts:

| | Learning enrollment | Programme enrollment |
| --- | --- | --- |
| Subject | An employee | A beneficiary or household |
| Object | A course version | A humanitarian programme |
| Lifecycle | Assigned → started → completed → certified | Screened → enrolled → active → exited |
| Key attributes | Due date, progress percentage, attempts, pass score | Eligibility basis, entry date, exit reason, assistance received |
| Governed by | HR policy | Targeting criteria and donor rules |
| Table | `lms_enrollments` | `programme_enrollments` |

v1.0 named both `enrollments`, which would have produced either a single confused table or two tables with the same name in different schemas — the kind of ambiguity that produces a subtle reporting error two years later. The v2.0 names are explicit.

## 7.2 Ubiquitous language

Terms mean exactly one thing within a context. Where the same word appears in two contexts with different meanings, both are listed and disambiguated.

### 7.2.1 Grant Management

| Term | Definition | Not to be confused with |
| --- | --- | --- |
| Donor | An organisation providing funding | Partner, which is an implementing relationship |
| Grant | A funding award with a defined period, ceiling and set of obligations | Contract, which in this platform means an employment contract |
| Award amount | The total ceiling the donor has committed | Received to date, which is what has actually arrived |
| Disbursement | An actual receipt of funds against a grant | Expenditure, which is money spent |
| Budget line | A costed category within a grant budget | Activity, which is work performed |
| Burn rate | Expenditure as a proportion of budget, compared with elapsed time as a proportion of the grant period | Utilisation, used loosely elsewhere to mean either |
| Compliance score | A computed 0–100 indicator of obligation fulfilment | Risk score, which is forward-looking |
| Reporting period | A donor-defined window with a report obligation and deadline | Financial period, which is the organisation's own calendar |
| Activity | A planned unit of work in the grant logframe | Programme, which is the Beneficiary context's delivery vehicle |

### 7.2.2 People Operations

| Term | Definition | Not to be confused with |
| --- | --- | --- |
| Employee | A person in an employment relationship with the tenant | User, which is a system account. An employee may have no user account; a user may not be an employee |
| Contract | The employment agreement governing terms and dates | Grant, which is donor funding |
| Position | A defined role in the organisational structure | Role, which in Identity means a permission set |
| Gross | Total earnings before statutory and voluntary deductions | Basic, which excludes allowances |
| PAYE | Income tax withheld at source under the applicable national schedule | Income tax, which may include amounts settled directly by the individual |
| Payroll run | A processing instance covering a period and a population | Pay period, which is the calendar window itself |
| National staff | Locally recruited, subject to local statutory deductions | International staff, subject to a different regime |

### 7.2.3 Beneficiary and Programme

| Term | Definition | Not to be confused with |
| --- | --- | --- |
| Beneficiary | An individual receiving or eligible for assistance | Participant, used by some donors for the same concept; the platform standardises on beneficiary |
| Household | A group sharing resources and a residence, the primary targeting unit | Family, which is a kinship relation and may span households |
| Head of household | The member identified as the household's primary respondent | Registrant, who is whoever provided the information |
| Displacement status | Host community, IDP, refugee or returnee | Nationality |
| Vulnerability score | A computed 0–100 composite driving targeting priority | Need, which is broader and not fully quantifiable |
| Programme | A delivery vehicle enrolling beneficiaries, funded by one or more grants | Project, used interchangeably by donors; the platform standardises on programme |
| Programme activity | A discrete delivery event such as a distribution or session | Grant activity, which is a logframe planning unit. They may be linked but are not the same |
| Attendance | Recorded presence at a programme activity | Enrollment, which is programme membership |

### 7.2.4 Field Data

| Term | Definition |
| --- | --- |
| Form template | A named, versioned data-collection instrument |
| Form version | An immutable published state of a template. Submissions bind to a version, never to a template |
| Submission | One completed instance of a form version, captured at a time and place by a person |
| Submission value | One field's answer within a submission |
| Sync session | A single reconciliation between a client device and the server |
| Fingerprint | A content hash over identifying fields, used to detect human duplicates |
| Client UUID | A client-generated identifier used for exactly-once processing of retries |

## 7.3 Entity-relationship diagrams

The diagrams below show cardinality and the significant attributes. Complete column definitions are in [08](08-database-schema.md) and [Appendix B](appendices/b-data-dictionary.md). Every table also carries the standard columns described in [08 §8.1](08-database-schema.md), omitted here for readability.

### 7.3.1 Identity and Access

```mermaid
erDiagram
    TENANTS ||--o{ USERS : "employs"
    TENANTS ||--o{ TENANT_SETTINGS : "configures"
    TENANTS ||--|| TENANT_QUOTAS : "limited by"
    TENANTS ||--o{ SUBSCRIPTIONS : "billed under"
    TENANTS ||--o{ TENANT_LIFECYCLE_EVENTS : "records"
    USERS ||--o{ USER_ROLES : "holds"
    ROLES ||--o{ USER_ROLES : "granted via"
    ROLES ||--o{ ROLE_PERMISSIONS : "confers"
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "granted by"
    USERS ||--o{ SESSIONS : "opens"
    USERS ||--o{ MFA_ENROLLMENTS : "registers"
    USERS ||--o{ LOGIN_ATTEMPTS : "generates"
    USERS ||--o{ PASSWORD_HISTORY : "accumulates"

    TENANTS {
        uuid id PK
        varchar name
        varchar slug UK
        char country_code
        varchar subscription_tier
        varchar status
        varchar timezone
        varchar default_locale
        varchar kms_key_reference
        boolean is_active
    }
    USERS {
        uuid id PK
        uuid tenant_id FK
        citext email
        varchar full_name
        varchar preferred_locale
        boolean is_active
        boolean mfa_enabled
        timestamptz last_login_at
        uuid employee_id
    }
    ROLES {
        uuid id PK
        uuid tenant_id FK
        varchar code
        varchar name
        boolean is_system
    }
    PERMISSIONS {
        uuid id PK
        varchar code UK
        varchar resource
        varchar action
        varchar description
    }
    SESSIONS {
        uuid id PK
        uuid user_id FK
        varchar refresh_token_hash
        inet ip_address
        timestamptz expires_at
        timestamptz revoked_at
    }
```

**Modelling notes.** `users.email` is `citext` with a composite unique constraint on `(tenant_id, email)`, correcting the v1.0 global unique constraint that would have prevented one person holding accounts at two tenant organisations — a real case for consultants and shared-services staff. Roles are per tenant with a `is_system` flag distinguishing the eight built-in roles from tenant-defined custom roles, which are a Phase 4 capability. The `users.employee_id` link is nullable and soft: a user need not be an employee, and an employee need not have portal access.

### 7.3.2 Grant Management

```mermaid
erDiagram
    DONORS ||--o{ GRANTS : "funds"
    GRANTS ||--|| GRANT_BUDGETS : "has"
    GRANT_BUDGETS ||--o{ BUDGET_LINES : "comprises"
    GRANT_BUDGETS ||--o{ BUDGET_REVISIONS : "versioned by"
    GRANTS ||--o{ DISBURSEMENTS : "receives"
    GRANTS ||--o{ GRANT_REPORT_PERIODS : "obligates"
    GRANT_REPORT_PERIODS ||--o{ GRANT_REPORTS : "fulfilled by"
    GRANTS ||--o{ GRANT_ACTIVITIES : "plans"
    GRANTS ||--o{ GRANT_DOCUMENTS : "evidenced by"
    GRANTS ||--o{ GRANT_COMPLIANCE_SNAPSHOTS : "scored in"
    BUDGET_LINES ||--o{ EXPENDITURES : "consumed by"

    DONORS {
        uuid id PK
        uuid tenant_id FK
        varchar name
        varchar donor_type
        char country
        varchar contact_email
        varchar iati_org_id
    }
    GRANTS {
        uuid id PK
        uuid tenant_id FK
        uuid donor_id FK
        varchar grant_number
        varchar title
        grant_status status
        date start_date
        date end_date
        numeric total_amount
        char currency
        numeric received_to_date
        numeric expenditure_to_date
        text_array sectors
        jsonb geographic_focus
        numeric compliance_score
    }
    BUDGET_LINES {
        uuid id PK
        uuid grant_budget_id FK
        varchar line_code
        varchar category
        varchar description
        numeric budgeted_amount
        numeric committed_amount
        numeric spent_amount
        char currency
        integer fiscal_year
    }
    DISBURSEMENTS {
        uuid id PK
        uuid grant_id FK
        numeric amount
        char currency
        numeric exchange_rate
        date received_date
        varchar bank_reference
        disbursement_status status
        uuid created_by FK
        uuid approved_by FK
    }
    GRANT_REPORT_PERIODS {
        uuid id PK
        uuid grant_id FK
        varchar period_label
        date period_start
        date period_end
        date due_date
        varchar report_type
        boolean is_mandatory
    }
```

**Modelling notes.** v1.0 had `grant_reports` linked directly to grants. Splitting out `grant_report_periods` matters because the obligation exists independently of its fulfilment: an overdue report is a period with no report, which is not expressible if only submitted reports are modelled. `received_to_date` and `expenditure_to_date` are maintained denormalised values on `grants`, updated transactionally with their source rows, because the burn-rate query is on the hot path and summing all disbursements on every read does not scale. A nightly reconciliation job verifies them against the source of truth and alerts on divergence.

### 7.3.3 People Operations

```mermaid
erDiagram
    DEPARTMENTS ||--o{ POSITIONS : "contains"
    DEPARTMENTS ||--o{ EMPLOYEES : "employs"
    POSITIONS ||--o{ EMPLOYEES : "filled by"
    EMPLOYEES ||--o{ CONTRACTS : "governed by"
    EMPLOYEES ||--o{ LEAVE_BALANCES : "accrues"
    EMPLOYEES ||--o{ LEAVE_REQUESTS : "submits"
    LEAVE_TYPES ||--o{ LEAVE_BALANCES : "typed by"
    LEAVE_TYPES ||--o{ LEAVE_REQUESTS : "typed by"
    EMPLOYEES ||--o{ PAYROLL_RECORDS : "paid by"
    PAYROLL_RUNS ||--o{ PAYROLL_RECORDS : "comprises"
    PAYROLL_RECORDS ||--o{ PAYROLL_RECORD_LINES : "itemised by"
    PAYROLL_RECORDS ||--o| PAYSLIP_ARTIFACTS : "documented by"
    TAX_BANDS ||--o{ PAYROLL_RECORD_LINES : "applied in"
    STATUTORY_CONTRIBUTION_RATES ||--o{ PAYROLL_RECORD_LINES : "applied in"
    EMPLOYEES ||--o{ PAYROLL_COST_ALLOCATIONS : "charged to"

    EMPLOYEES {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        varchar employee_number
        bytea first_name_encrypted
        bytea last_name_encrypted
        char nationality
        uuid department_id FK
        uuid position_id FK
        varchar employment_type
        emp_status status
        date hire_date
        date termination_date
        bytea nra_tin_encrypted
        bytea nsif_number_encrypted
        varchar duty_station
    }
    CONTRACTS {
        uuid id PK
        uuid employee_id FK
        varchar contract_type
        date start_date
        date end_date
        numeric gross_salary
        char salary_currency
        varchar payment_frequency
        jsonb allowances
        contract_status status
    }
    PAYROLL_RUNS {
        uuid id PK
        uuid tenant_id FK
        date pay_period_start
        date pay_period_end
        char country_code
        payroll_status status
        numeric total_gross_usd
        numeric total_paye_local
        numeric total_social_employee
        numeric total_social_employer
        numeric exchange_rate
        varchar exchange_rate_source
        date exchange_rate_date
        uuid prepared_by FK
        uuid approved_by FK
        timestamptz approved_at
    }
    TAX_BANDS {
        uuid id PK
        char country_code
        varchar tax_type
        integer band_order
        numeric lower_bound
        numeric upper_bound
        numeric rate_percent
        numeric fixed_amount
        char currency
        date effective_from
        date effective_to
    }
```

**Modelling notes.** `payroll_runs` is generalised from v1.0's South-Sudan-specific column names (`total_paye_ssp`, `total_nsif_employee`) to country-neutral ones with a `country_code`, because a tenant operating in both South Sudan and Uganda runs payroll separately per country and the schema must not privilege one. Employee PII columns are `bytea` holding AES-256-GCM ciphertext; the searchable derivatives are separate blind-index columns. `payroll_cost_allocations` is new in v2.0 and implements the v1.0 cross-domain note that payroll expenditure maps to grant budget lines — without it, that relationship had nowhere to live.

### 7.3.4 Learning

```mermaid
erDiagram
    COURSES ||--o{ COURSE_VERSIONS : "published as"
    COURSE_VERSIONS ||--o{ MODULES : "structured into"
    MODULES ||--o{ LESSONS : "contains"
    MODULES ||--o{ ASSESSMENTS : "assessed by"
    ASSESSMENTS ||--o{ QUESTIONS : "asks"
    QUESTIONS ||--o{ ANSWER_OPTIONS : "offers"
    COURSE_VERSIONS ||--o{ LMS_ENROLLMENTS : "enrolls into"
    LMS_ENROLLMENTS ||--o{ LESSON_PROGRESS : "tracks"
    LMS_ENROLLMENTS ||--o{ ASSESSMENT_ATTEMPTS : "attempts"
    LMS_ENROLLMENTS ||--o| CERTIFICATES : "earns"
    MANDATORY_TRAINING_RULES ||--o{ LMS_ENROLLMENTS : "triggers"

    COURSE_VERSIONS {
        uuid id PK
        uuid course_id FK
        integer version_number
        varchar title
        integer pass_threshold_percent
        integer estimated_minutes
        boolean is_published
        timestamptz published_at
        varchar scorm_package_ref
    }
    LMS_ENROLLMENTS {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid course_version_id FK
        enrollment_source source
        enrollment_status status
        date due_date
        timestamptz started_at
        timestamptz completed_at
        numeric final_score
        boolean is_mandatory
    }
    MANDATORY_TRAINING_RULES {
        uuid id PK
        uuid tenant_id FK
        uuid course_id FK
        varchar applies_to_type
        uuid applies_to_id
        integer due_days_after_hire
        integer recurrence_months
    }
    CERTIFICATES {
        uuid id PK
        uuid enrollment_id FK
        varchar certificate_number
        date issued_date
        date expires_date
        varchar artifact_ref
        varchar verification_hash
    }
```

**Modelling notes.** Enrollments bind to a `course_version_id`, never to a `course_id`. A learner who started version 3 finishes version 3 even if version 4 publishes mid-course, and their certificate states which version they completed — which matters when an auditor asks whether a staff member was trained on the current safeguarding policy or the previous one. `recurrence_months` on the mandatory rule supports annual refresher requirements, which most safeguarding and security policies have.

### 7.3.5 Beneficiary and Programme

```mermaid
erDiagram
    HOUSEHOLDS ||--o{ BENEFICIARIES : "comprises"
    HOUSEHOLDS ||--o{ HOUSEHOLD_MEMBERS : "lists"
    BENEFICIARIES ||--o{ VULNERABILITY_ASSESSMENTS : "assessed by"
    BENEFICIARIES ||--o{ PROGRAMME_ENROLLMENTS : "enrolled via"
    PROGRAMMES ||--o{ PROGRAMME_ENROLLMENTS : "accepts"
    PROGRAMMES ||--o{ PROGRAMME_ACTIVITIES : "delivers"
    PROGRAMME_ACTIVITIES ||--o{ ATTENDANCE_RECORDS : "attended via"
    PROGRAMME_ENROLLMENTS ||--o{ ATTENDANCE_RECORDS : "records"
    BENEFICIARIES ||--o{ BENEFICIARY_CONSENTS : "consents via"
    BENEFICIARIES ||--o{ BENEFICIARY_MERGE_LOG : "merged in"

    BENEFICIARIES {
        uuid id PK
        uuid tenant_id FK
        varchar unique_id
        uuid household_id FK
        bytea first_name_encrypted
        bytea last_name_encrypted
        varchar name_blind_index
        varchar name_phonetic_index
        bytea dob_encrypted
        smallint estimated_age
        char sex
        varchar displacement_status
        numeric vulnerability_score
        geography location_gps
        varchar location_admin1
        varchar location_admin2
        varchar location_settlement
        date registration_date
        uuid registered_by FK
        varchar status
    }
    HOUSEHOLDS {
        uuid id PK
        uuid tenant_id FK
        varchar household_code
        uuid head_beneficiary_id FK
        smallint member_count
        boolean female_headed
        smallint children_under_5
        boolean chronic_illness_present
        smallint hfias_score
        geography location_gps
        varchar location_settlement
    }
    PROGRAMMES {
        uuid id PK
        uuid tenant_id FK
        uuid grant_id
        varchar name
        varchar sector
        date start_date
        date end_date
        jsonb eligibility_criteria
        integer target_beneficiaries
        varchar status
    }
    PROGRAMME_ENROLLMENTS {
        uuid id PK
        uuid tenant_id FK
        uuid programme_id FK
        uuid beneficiary_id FK
        date enrolled_date
        varchar eligibility_basis
        numeric vulnerability_score_at_entry
        date exit_date
        varchar exit_reason
        varchar status
    }
    VULNERABILITY_ASSESSMENTS {
        uuid id PK
        uuid beneficiary_id FK
        numeric score
        jsonb factor_breakdown
        varchar algorithm_version
        date assessed_date
        uuid assessed_by FK
    }
```

**Modelling notes.** Vulnerability scores are versioned assessments rather than a single mutable column, because a targeting decision made in March must be explicable using March's score and March's algorithm, not today's. The score is also denormalised onto `beneficiaries` for query performance, and `programme_enrollments.vulnerability_score_at_entry` freezes the value that justified the enrollment. Location is modelled at four granularities — precise coordinates, admin1, admin2 and settlement — so that access control can serve coarse location to roles that should not see precise coordinates without a second query or a decryption step.

### 7.3.6 Field Data

```mermaid
erDiagram
    FORM_TEMPLATES ||--o{ FORM_TEMPLATE_VERSIONS : "published as"
    FORM_TEMPLATE_VERSIONS ||--o{ FORM_FIELDS : "defines"
    FORM_FIELDS ||--o{ FIELD_VALIDATION_RULES : "constrained by"
    FORM_TEMPLATE_VERSIONS ||--o{ FORM_ASSIGNMENTS : "assigned via"
    FORM_TEMPLATE_VERSIONS ||--o{ SUBMISSIONS : "captured as"
    SUBMISSIONS ||--o{ SUBMISSION_VALUES : "contains"
    SUBMISSIONS ||--o{ SUBMISSION_ATTACHMENTS : "attaches"
    SUBMISSIONS ||--o| SUBMISSION_REVIEW_QUEUE : "flagged in"
    FORM_FIELDS ||--o{ SUBMISSION_VALUES : "answered by"
    SYNC_SESSIONS ||--o{ SUBMISSIONS : "delivered in"

    FORM_TEMPLATE_VERSIONS {
        uuid id PK
        uuid form_template_id FK
        integer version_number
        jsonb schema
        boolean is_published
        timestamptz published_at
        uuid published_by FK
    }
    FORM_FIELDS {
        uuid id PK
        uuid form_template_version_id FK
        varchar field_key
        varchar label
        field_type type
        integer display_order
        boolean is_required
        boolean is_pii
        boolean is_fingerprint_component
        jsonb options
    }
    SUBMISSIONS {
        uuid id PK
        uuid tenant_id FK
        uuid form_template_version_id FK
        uuid client_uuid UK
        uuid submitted_by FK
        timestamptz captured_at
        timestamptz received_at
        geography capture_location
        varchar content_fingerprint
        submission_status status
        uuid beneficiary_id
        uuid grant_activity_id
        uuid sync_session_id FK
        varchar device_id
    }
    SUBMISSION_VALUES {
        uuid id PK
        uuid submission_id FK
        uuid form_field_id FK
        text value_text
        numeric value_number
        date value_date
        boolean value_boolean
        geography value_location
        bytea value_encrypted
    }
```

**Modelling notes.** `submission_values` uses typed columns rather than a single text column, so range validation, aggregation and indexing work without casting. The `value_encrypted` column holds any value from a field marked `is_pii`. `captured_at` and `received_at` are both recorded and frequently differ by days — that gap is the offline model made visible in the data, and analysis that ignores it produces wrong timelines.

### 7.3.7 Platform

```mermaid
erDiagram
    AUDIT_EVENTS }o--|| TENANTS : "scoped to"
    FILE_OBJECTS ||--o{ FILE_ACCESS_GRANTS : "shared via"
    FILE_OBJECTS ||--o| FILE_SCAN_RESULTS : "scanned by"
    NOTIFICATION_TEMPLATES ||--o{ NOTIFICATION_DELIVERIES : "renders"
    OUTBOX_EVENTS }o--|| TENANTS : "scoped to"
    INTEGRATION_CONNECTIONS ||--o{ WEBHOOK_DELIVERIES : "delivers"
    KPI_DEFINITIONS ||--o{ KPI_SNAPSHOTS : "measured as"
    AI_PROMPTS ||--o{ AI_GENERATIONS : "produces"
    AI_GENERATIONS ||--o| AI_REVIEW_QUEUE : "queued for"

    AUDIT_EVENTS {
        uuid id PK
        uuid tenant_id
        timestamptz occurred_at
        uuid actor_user_id
        varchar actor_role
        varchar action
        varchar resource_type
        uuid resource_id
        jsonb before_state
        jsonb after_state
        varchar purpose
        inet ip_address
        varchar correlation_id
        varchar previous_hash
        varchar record_hash
    }
    OUTBOX_EVENTS {
        uuid id PK
        uuid tenant_id
        varchar event_type
        integer schema_version
        uuid aggregate_id
        varchar aggregate_type
        jsonb payload
        varchar correlation_id
        varchar causation_id
        timestamptz created_at
        timestamptz published_at
        integer publish_attempts
    }
    FILE_OBJECTS {
        uuid id PK
        uuid tenant_id FK
        varchar storage_key
        varchar original_filename
        varchar content_type
        bigint size_bytes
        varchar purpose
        varchar owner_resource_type
        uuid owner_resource_id
        scan_status scan_status
        varchar checksum_sha256
        date retention_until
    }
```

## 7.4 Cross-domain relationships

Five relationships cross context boundaries. Each is listed with its integration mechanism, because *how* they cross determines the coupling cost.

| # | Relationship | Mechanism | Consistency | Rationale |
| --- | --- | --- | --- | --- |
| X-1 | `users` (Identity) ↔ `employees` (People) | Soft reference in both directions, reconciled by event. `users.employee_id` and `employees.user_id` are nullable and not FK-constrained across services | Eventual, seconds | An employee may have no portal access; a user may be a donor or auditor with no employment relationship. A hard FK would force the two lifecycles to be the same, which they are not |
| X-2 | `employees` (People) → `lms_enrollments` (Learning) | Published language: `hr.employee.onboarded` and `hr.employee.terminated` events | Eventual, seconds | Learning must never block an HR operation. If Learning is down, enrollments are created when it recovers, and the nightly reconciliation job catches anything lost |
| X-3 | `grants` (Grant) → `programmes` (Beneficiary) | Shared kernel: `programmes.grant_id` holds the grant identifier, not FK-constrained across services | Eventual, referential integrity verified nightly | Burn rate must be attributable to served populations. This is the one place a cross-context identifier is accepted, and any extension of it requires an ADR |
| X-4 | `submissions` (Field Data) → `grant_activities` (Grant) | Published language: `fielddata.submission.linked` event carries the linkage | Eventual | The M&E evidence chain — a donor asking "prove this activity happened" traverses this link to reach photos, GPS and timestamps |
| X-5 | `payroll_runs` (People) → `budget_lines` (Grant) | Published language: `hr.payroll_run.approved` carries cost allocations, materialised into `payroll_cost_allocations` and reflected in `budget_lines.spent_amount` | Eventual, reconciled monthly | Staff cost is typically the largest budget line; without this, burn rate is systematically understated |

```mermaid
flowchart LR
    Users["users<br/>Identity"]
    Employees["employees<br/>People"]
    Enrollments["lms_enrollments<br/>Learning"]
    Grants["grants<br/>Grant"]
    Programmes["programmes<br/>Beneficiary"]
    Submissions["submissions<br/>Field Data"]
    Activities["grant_activities<br/>Grant"]
    Payroll["payroll_runs<br/>People"]
    BudgetLines["budget_lines<br/>Grant"]

    Users <-->|"X-1 soft link"| Employees
    Employees -.->|"X-2 event"| Enrollments
    Grants -.->|"X-3 shared id"| Programmes
    Submissions -.->|"X-4 event"| Activities
    Payroll -.->|"X-5 event"| BudgetLines
```

### 7.4.1 Referential integrity across services

Foreign keys do not span service boundaries. The gap is closed by three mechanisms rather than pretending it does not exist:

1. **Validation at write time.** When `programmes.grant_id` is set, `beneficiary-service` validates the grant exists via the Grant API and caches the result briefly. A non-existent grant is rejected.
2. **Nightly integrity reconciliation.** A job checks every cross-context reference for a resolvable target and reports orphans to an operational dashboard. Orphans are a bug signal, not something to auto-repair.
3. **Tombstone events.** Deleting an aggregate that other contexts reference emits a tombstone event. Consumers mark their references as dangling rather than silently rendering a broken link.

## 7.5 Aggregate boundaries and transactional scope

An aggregate is the unit of transactional consistency. Writes inside one are atomic; writes across two are eventually consistent.

| Aggregate root | Contained entities | Invariants enforced transactionally |
| --- | --- | --- |
| `Grant` | budget, budget lines, report periods, activities | Budget lines sum to the grant total; report periods fall within the grant period; status transitions are legal |
| `Disbursement` | — | Amount is positive; cumulative disbursements do not exceed the ceiling (enforced with a row lock on the grant) |
| `Employee` | contracts, leave balances | Only one active contract at a time; hire date precedes all contract start dates |
| `PayrollRun` | payroll records, record lines | Run totals equal the sum of records; a run is either fully computed or in a resumable partial state, never silently incomplete |
| `Household` | household members | `member_count` matches the actual member rows; exactly one head of household |
| `Beneficiary` | consents, vulnerability assessments | A current assessment exists; consent is present before PII is stored |
| `Submission` | submission values, attachments | Every required field of the bound form version has a value; values conform to their field types |
| `CourseVersion` | modules, lessons, assessments, questions | A published version is immutable; assessments have at least one question; pass threshold is between 1 and 100 |

**The rule that follows.** A single API request modifies exactly one aggregate. An operation that appears to need two — approving a payroll run and updating grant budget lines — is one transactional write plus an event, never a distributed transaction. There are no two-phase commits in this architecture.

## 7.6 Standard patterns applied to every entity

| Pattern | Implementation | Rationale |
| --- | --- | --- |
| Surrogate key | `uuid` generated with `gen_random_uuid()` | Client-generatable, which the offline model requires; no cross-tenant sequence leakage |
| Tenant scoping | `tenant_id uuid NOT NULL` on every tenant-owned table | RLS foundation (PRIN-03) |
| Soft delete | `is_deleted boolean` plus `deleted_at`, `deleted_by` | Audit integrity (PRIN-05); the only exception is the erasure workflow |
| Timestamps | `created_at`, `updated_at`, both `TIMESTAMPTZ`, maintained by trigger | Non-negotiable for debugging and audit |
| Attribution | `created_by`, `updated_by` referencing users | "Who changed this" answerable without joining the audit log |
| Optimistic concurrency | `version integer`, incremented by trigger, surfaced as an ETag | Prevents lost updates without pessimistic locking |
| Money | `NUMERIC(15,2)` plus a `CHAR(3)` currency, always together | Floating-point money is a defect |
| Converted money | Additionally stores rate, rate source and rate date | A converted figure without its rate is unauditable |
| Enumerations | PostgreSQL enum types for closed, stable sets; lookup tables for sets tenants may extend | Type safety where the set is fixed; flexibility where it is not |
| Encrypted PII | `bytea` ciphertext column plus separate blind-index columns for search | Searchable without decrypting the corpus |
| JSONB | Only for genuinely variable structure: form schemas, eligibility criteria, event payloads, before/after audit state | JSONB for data with a known shape is a schema-design failure deferred |
