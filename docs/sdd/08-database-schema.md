# 08 — Database Schema

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Chapter:** 08 — Database Schema
> **Owner:** Data Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Related ADRs:** [ADR-0002](adr/0002-hybrid-multi-tenancy-with-rls.md), [ADR-0006](adr/0006-per-tenant-schema-for-payroll.md), [ADR-0011](adr/0011-transactional-outbox.md), [ADR-0015](adr/0015-application-layer-pii-encryption.md)

---

## 8.1 Conventions

### 8.1.1 Standard columns

Every tenant-owned table carries these columns. They are added by the migration template, not by hand, so no table can be created without them.

```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
created_by  UUID REFERENCES users(id),
updated_by  UUID REFERENCES users(id),
version     INTEGER NOT NULL DEFAULT 1,
is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
deleted_at  TIMESTAMPTZ,
deleted_by  UUID REFERENCES users(id)
```

`ON DELETE RESTRICT` on `tenant_id` is deliberate: a tenant row cannot be deleted while any data references it, which forces deletion through the controlled offboarding workflow in [29](29-multi-tenancy-and-tenant-lifecycle.md) rather than through an accidental cascade.

### 8.1.2 Global rules

| Rule | Enforcement |
| --- | --- |
| Money is `NUMERIC(15,2)`, never `FLOAT` or `REAL` | Migration lint rejects floating-point columns whose name matches money patterns |
| Currency is `CHAR(3)` ISO-4217 with a check constraint | Column-level check |
| Every money column has a currency column in the same table | Migration review |
| Timestamps are `TIMESTAMPTZ`, stored UTC | Migration lint rejects `TIMESTAMP` without time zone |
| Soft delete only; no `DELETE` grant on tenant data for service roles | Database grants |
| `updated_at` and `version` maintained by trigger, never by application code | Trigger applied by template |
| RLS enabled on every tenant table before it can receive data | Post-migration verification job fails the deploy otherwise |
| Text uses `TEXT` or `VARCHAR(n)` where a real limit exists; no `CHAR(n)` except fixed-width codes | Review |
| Enum types for closed sets; lookup tables where tenants extend the set | Review |
| Every foreign key has a supporting index | Migration lint |
| No table without a primary key | Migration lint |

### 8.1.3 Extensions

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid, digest
CREATE EXTENSION IF NOT EXISTS citext;        -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS postgis;       -- geography type and spatial indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- trigram similarity for name matching
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch; -- phonetic matching, dmetaphone
CREATE EXTENSION IF NOT EXISTS btree_gist;    -- exclusion constraints on ranges
CREATE EXTENSION IF NOT EXISTS pg_stat_statements; -- query performance analysis
```

> **Correction to v1.0.** v1.0 §6.5 declared `location_gps POINT` and described it as PostGIS. `POINT` is a native PostgreSQL geometric type on an abstract plane: it supports no coordinate reference system, no accurate distance in metres, and no meaningful spatial index for geographic queries. All location columns use `GEOGRAPHY(Point, 4326)` from PostGIS with GiST indexes.

### 8.1.4 Shared trigger functions

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Prevents a client from silently overwriting a concurrent change.
CREATE OR REPLACE FUNCTION enforce_optimistic_lock()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.version IS NOT NULL AND NEW.version <> OLD.version THEN
        RAISE EXCEPTION 'NGOIS-DB-0001: version conflict, expected %, found %',
            NEW.version, OLD.version
            USING ERRCODE = '40001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied to append-only tables. Protects the audit trail even from a
-- compromised service role, because the grant is not the only barrier.
CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'NGOIS-DB-0002: table % is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
```

### 8.1.5 Row-level security template

```sql
-- Applied to every tenant-owned table.
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <table>
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
```

> **Correction to v1.0.** v1.0 §6.1 specified `USING (tenant_id = auth.jwt() -> 'tenant_id')`. That comparison is between `uuid` and `jsonb` and does not type-check; with the `->>` operator it would compare `uuid` to `text` and still fail without a cast. More importantly, reading the tenant from the JWT inside the policy couples the database to a specific token shape. The platform instead sets a session variable from the gateway-validated context at the start of every request:
>
> ```sql
> SET LOCAL app.current_tenant = '9f2a...';
> ```
>
> `SET LOCAL` scopes it to the transaction, so a pooled connection cannot leak tenant context between requests — the failure mode that makes connection pooling and RLS dangerous together. `FORCE ROW LEVEL SECURITY` ensures the policy applies even to the table owner. The safeguard against an unset variable is covered in [29 §29.3](29-multi-tenancy-and-tenant-lifecycle.md).

### 8.1.6 Enum types

```sql
CREATE TYPE grant_status AS ENUM
    ('draft','pending_approval','active','suspended','closed','completed','cancelled');
CREATE TYPE disbursement_status AS ENUM
    ('recorded','pending_approval','approved','reconciled','disputed','reversed');
CREATE TYPE emp_status AS ENUM
    ('pending','active','on_leave','suspended','terminated');
CREATE TYPE contract_status AS ENUM
    ('draft','active','expiring','expired','terminated','renewed');
CREATE TYPE payroll_status AS ENUM
    ('draft','computing','under_review','approved','disbursed','reversed','failed');
CREATE TYPE enrollment_status AS ENUM
    ('assigned','in_progress','completed','failed','expired','waived');
CREATE TYPE enrollment_source AS ENUM
    ('automatic_mandatory','manual_assignment','self_enrollment','recurrence');
CREATE TYPE submission_status AS ENUM
    ('received','validating','accepted','rejected','review_required','superseded');
CREATE TYPE field_type AS ENUM
    ('text','textarea','number','integer','decimal','date','datetime','boolean',
     'select_one','select_multiple','gps','photo','signature','barcode','calculated');
CREATE TYPE scan_status AS ENUM
    ('pending','clean','infected','failed','skipped');
CREATE TYPE notification_channel AS ENUM
    ('email','sms','in_app','webhook');
CREATE TYPE delivery_status AS ENUM
    ('queued','sending','delivered','failed','suppressed','bounced');
CREATE TYPE tenant_status AS ENUM
    ('provisioning','active','suspended','offboarding','deleted');
```

Enums are used where the set is closed and changing it is a deliberate architectural act. Adding a value is `ALTER TYPE ... ADD VALUE`, which is non-blocking in PostgreSQL 15 but cannot run inside a transaction block — noted here because it is a recurring migration surprise.

---

## 8.2 Schema: Identity and Access

```sql
CREATE TABLE tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(200) NOT NULL,
    legal_name          VARCHAR(300),
    slug                VARCHAR(80) NOT NULL,
    country_code        CHAR(2) NOT NULL,
    registration_number VARCHAR(100),
    subscription_tier   VARCHAR(20) NOT NULL DEFAULT 'starter',
    status              tenant_status NOT NULL DEFAULT 'provisioning',
    timezone            VARCHAR(60) NOT NULL DEFAULT 'Africa/Juba',
    default_locale      VARCHAR(10) NOT NULL DEFAULT 'en-GB',
    default_currency    CHAR(3) NOT NULL DEFAULT 'USD',
    kms_key_reference   VARCHAR(300),
    payroll_schema_name VARCHAR(80),
    data_region         VARCHAR(40) NOT NULL DEFAULT 'africa-south1',
    retention_years     SMALLINT NOT NULL DEFAULT 7,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    provisioned_at      TIMESTAMPTZ,
    offboarding_started_at TIMESTAMPTZ,
    scheduled_deletion_at  TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version             INTEGER NOT NULL DEFAULT 1,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT tenants_slug_unique UNIQUE (slug),
    CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
    CONSTRAINT tenants_tier_valid CHECK
        (subscription_tier IN ('starter','professional','enterprise')),
    CONSTRAINT tenants_country_format CHECK (country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT tenants_currency_format CHECK (default_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT tenants_retention_min CHECK (retention_years >= 7)
);

CREATE INDEX idx_tenants_status ON tenants (status) WHERE is_deleted = FALSE;
CREATE INDEX idx_tenants_deletion_due ON tenants (scheduled_deletion_at)
    WHERE scheduled_deletion_at IS NOT NULL;
```

`tenants` is the one table with no `tenant_id` and no RLS policy, since it *is* the tenant dimension. Access is restricted at the application layer to `super_admin` for cross-tenant reads, and every service filters to the caller's own tenant.

```sql
CREATE TABLE users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    external_auth_id  VARCHAR(255),
    email             CITEXT NOT NULL,
    full_name         VARCHAR(200) NOT NULL,
    phone_e164        VARCHAR(20),
    preferred_locale  VARCHAR(10) NOT NULL DEFAULT 'en-GB',
    employee_id       UUID,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    is_service_account BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_enforced_at   TIMESTAMPTZ,
    last_login_at     TIMESTAMPTZ,
    last_login_ip     INET,
    failed_login_count SMALLINT NOT NULL DEFAULT 0,
    locked_until      TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    invited_at        TIMESTAMPTZ,
    activated_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by        UUID,
    updated_by        UUID,
    version           INTEGER NOT NULL DEFAULT 1,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID,

    CONSTRAINT users_email_per_tenant UNIQUE (tenant_id, email),
    CONSTRAINT users_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT users_phone_format CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    CONSTRAINT users_lock_requires_reason CHECK
        (locked_until IS NULL OR failed_login_count > 0)
);

CREATE INDEX idx_users_tenant_active ON users (tenant_id) WHERE is_active AND NOT is_deleted;
CREATE INDEX idx_users_employee ON users (employee_id) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX idx_users_external_auth ON users (external_auth_id)
    WHERE external_auth_id IS NOT NULL;
```

> **Correction to v1.0.** v1.0 declared `email VARCHAR(255) UNIQUE` while describing it as "unique per tenant+email combination". A column-level `UNIQUE` is global. The constraint is now composite on `(tenant_id, email)` and the type is `CITEXT` so that `Amal@ngo.org` and `amal@ngo.org` collide, which is what users expect.

```sql
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE RESTRICT,
    code        VARCHAR(50) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,
    inherits_from UUID REFERENCES roles(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version     INTEGER NOT NULL DEFAULT 1,
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT roles_code_scope UNIQUE (tenant_id, code),
    CONSTRAINT roles_system_has_no_tenant CHECK
        ((is_system AND tenant_id IS NULL) OR (NOT is_system AND tenant_id IS NOT NULL)),
    CONSTRAINT roles_no_self_inherit CHECK (inherits_from IS NULL OR inherits_from <> id)
);

CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(100) NOT NULL UNIQUE,
    resource    VARCHAR(50) NOT NULL,
    sub_resource VARCHAR(50),
    action      VARCHAR(30) NOT NULL,
    description TEXT NOT NULL,
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    requires_mfa BOOLEAN NOT NULL DEFAULT FALSE,
    requires_dual_auth BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT permissions_code_format CHECK (code ~ '^[a-z_]+(:[a-z_]+){1,2}$')
);

CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by    UUID REFERENCES users(id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by  UUID REFERENCES users(id),
    expires_at  TIMESTAMPTZ,
    reason      TEXT,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_expiring ON user_roles (expires_at)
    WHERE expires_at IS NOT NULL;

CREATE TABLE sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id          UUID NOT NULL REFERENCES tenants(id),
    refresh_token_hash VARCHAR(128) NOT NULL,
    refresh_family_id  UUID NOT NULL,
    device_fingerprint VARCHAR(128),
    user_agent         TEXT,
    ip_address         INET,
    mfa_satisfied      BOOLEAN NOT NULL DEFAULT FALSE,
    issued_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ,
    revocation_reason  VARCHAR(50),

    CONSTRAINT sessions_token_hash_unique UNIQUE (refresh_token_hash)
);

CREATE INDEX idx_sessions_user_active ON sessions (user_id)
    WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_family ON sessions (refresh_family_id);
CREATE INDEX idx_sessions_expiry ON sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE mfa_enrollments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method        VARCHAR(20) NOT NULL DEFAULT 'totp',
    secret_encrypted BYTEA NOT NULL,
    recovery_codes_hashed TEXT[],
    confirmed_at  TIMESTAMPTZ,
    last_used_at  TIMESTAMPTZ,
    last_used_counter BIGINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mfa_method_valid CHECK (method IN ('totp','recovery_code'))
);

CREATE TABLE login_attempts (
    id           BIGSERIAL PRIMARY KEY,
    tenant_id    UUID,
    email_attempted CITEXT,
    user_id      UUID,
    succeeded    BOOLEAN NOT NULL,
    failure_reason VARCHAR(50),
    ip_address   INET NOT NULL,
    user_agent   TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_email_time ON login_attempts (email_attempted, attempted_at DESC);
CREATE INDEX idx_login_attempts_ip_time ON login_attempts (ip_address, attempted_at DESC);
```

`last_used_counter` on `mfa_enrollments` prevents TOTP replay: a code already used within its window is rejected even if it is still time-valid.

---

## 8.3 Schema: Grant Management

```sql
CREATE TABLE donors (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name          VARCHAR(300) NOT NULL,
    short_name    VARCHAR(80),
    donor_type    VARCHAR(50) NOT NULL,
    country       CHAR(2),
    contact_name  VARCHAR(200),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    iati_org_id   VARCHAR(50),
    website       VARCHAR(300),
    reporting_requirements JSONB,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by    UUID REFERENCES users(id),
    updated_by    UUID REFERENCES users(id),
    version       INTEGER NOT NULL DEFAULT 1,
    is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID REFERENCES users(id),

    CONSTRAINT donors_type_valid CHECK (donor_type IN
        ('bilateral','multilateral','foundation','private','corporate',
         'individual','pooled_fund','ingo')),
    CONSTRAINT donors_name_per_tenant UNIQUE (tenant_id, name)
);

CREATE INDEX idx_donors_tenant ON donors (tenant_id) WHERE NOT is_deleted;
CREATE INDEX idx_donors_iati ON donors (iati_org_id) WHERE iati_org_id IS NOT NULL;

CREATE TABLE grants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    donor_id            UUID NOT NULL REFERENCES donors(id) ON DELETE RESTRICT,
    grant_number        VARCHAR(100) NOT NULL,
    internal_code       VARCHAR(50),
    title               VARCHAR(500) NOT NULL,
    description         TEXT,
    status              grant_status NOT NULL DEFAULT 'draft',
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    total_amount        NUMERIC(15,2) NOT NULL,
    currency            CHAR(3) NOT NULL,
    received_to_date    NUMERIC(15,2) NOT NULL DEFAULT 0,
    expenditure_to_date NUMERIC(15,2) NOT NULL DEFAULT 0,
    committed_to_date   NUMERIC(15,2) NOT NULL DEFAULT 0,
    indirect_cost_rate  NUMERIC(5,2),
    sectors             TEXT[],
    dac_purpose_codes   TEXT[],
    geographic_focus    JSONB,
    lead_user_id        UUID REFERENCES users(id),
    compliance_score    NUMERIC(5,2),
    compliance_scored_at TIMESTAMPTZ,
    iati_activity_id    VARCHAR(120),
    is_iati_published   BOOLEAN NOT NULL DEFAULT FALSE,
    closed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID REFERENCES users(id),
    updated_by          UUID REFERENCES users(id),
    version             INTEGER NOT NULL DEFAULT 1,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at          TIMESTAMPTZ,
    deleted_by          UUID REFERENCES users(id),

    CONSTRAINT grants_number_per_donor UNIQUE (tenant_id, donor_id, grant_number),
    CONSTRAINT grants_period_valid CHECK (end_date > start_date),
    CONSTRAINT grants_amount_positive CHECK (total_amount > 0),
    CONSTRAINT grants_received_not_negative CHECK (received_to_date >= 0),
    CONSTRAINT grants_received_within_ceiling CHECK (received_to_date <= total_amount * 1.0001),
    CONSTRAINT grants_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT grants_score_range CHECK
        (compliance_score IS NULL OR compliance_score BETWEEN 0 AND 100),
    CONSTRAINT grants_closed_has_timestamp CHECK
        (status <> 'closed' OR closed_at IS NOT NULL)
);

CREATE INDEX idx_grants_tenant_status ON grants (tenant_id, status) WHERE NOT is_deleted;
CREATE INDEX idx_grants_donor ON grants (donor_id);
CREATE INDEX idx_grants_expiring ON grants (tenant_id, end_date)
    WHERE status = 'active' AND NOT is_deleted;
CREATE INDEX idx_grants_sectors ON grants USING GIN (sectors);
CREATE INDEX idx_grants_geo ON grants USING GIN (geographic_focus jsonb_path_ops);
CREATE INDEX idx_grants_lead ON grants (lead_user_id) WHERE lead_user_id IS NOT NULL;
```

The `received_within_ceiling` check uses a `1.0001` factor rather than an exact comparison to tolerate the last-cent rounding that appears in multi-currency conversion, while still catching a genuine overrun.

```sql
CREATE TABLE grant_budgets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    grant_id       UUID NOT NULL REFERENCES grants(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL DEFAULT 1,
    is_current     BOOLEAN NOT NULL DEFAULT TRUE,
    total_budgeted NUMERIC(15,2) NOT NULL,
    currency       CHAR(3) NOT NULL,
    approved_at    TIMESTAMPTZ,
    approved_by    UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version        INTEGER NOT NULL DEFAULT 1,
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT grant_budgets_version_unique UNIQUE (grant_id, version_number)
);

CREATE UNIQUE INDEX idx_grant_budgets_one_current ON grant_budgets (grant_id)
    WHERE is_current AND NOT is_deleted;

CREATE TABLE budget_lines (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id),
    grant_budget_id  UUID NOT NULL REFERENCES grant_budgets(id) ON DELETE CASCADE,
    parent_line_id   UUID REFERENCES budget_lines(id),
    line_code        VARCHAR(50) NOT NULL,
    category         VARCHAR(100) NOT NULL,
    description      VARCHAR(500) NOT NULL,
    budgeted_amount  NUMERIC(15,2) NOT NULL,
    committed_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    spent_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency         CHAR(3) NOT NULL,
    fiscal_year      INTEGER,
    is_staff_cost    BOOLEAN NOT NULL DEFAULT FALSE,
    display_order    INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version          INTEGER NOT NULL DEFAULT 1,
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT budget_lines_code_unique UNIQUE (grant_budget_id, line_code),
    CONSTRAINT budget_lines_amount_positive CHECK (budgeted_amount >= 0),
    CONSTRAINT budget_lines_spent_not_negative CHECK (spent_amount >= 0),
    CONSTRAINT budget_lines_no_self_parent CHECK (parent_line_id IS NULL OR parent_line_id <> id)
);

CREATE INDEX idx_budget_lines_budget ON budget_lines (grant_budget_id) WHERE NOT is_deleted;
CREATE INDEX idx_budget_lines_staff_cost ON budget_lines (grant_budget_id)
    WHERE is_staff_cost AND NOT is_deleted;

CREATE TABLE disbursements (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id),
    grant_id         UUID NOT NULL REFERENCES grants(id) ON DELETE RESTRICT,
    tranche_number   INTEGER,
    amount           NUMERIC(15,2) NOT NULL,
    currency         CHAR(3) NOT NULL,
    amount_base      NUMERIC(15,2),
    exchange_rate    NUMERIC(18,8),
    exchange_rate_source VARCHAR(80),
    exchange_rate_date DATE,
    received_date    DATE NOT NULL,
    value_date       DATE,
    bank_reference   VARCHAR(200),
    payment_method   VARCHAR(40),
    status           disbursement_status NOT NULL DEFAULT 'recorded',
    confirmation_file_id UUID,
    notes            TEXT,
    approved_by      UUID REFERENCES users(id),
    approved_at      TIMESTAMPTZ,
    reconciled_at    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by       UUID REFERENCES users(id),
    updated_by       UUID REFERENCES users(id),
    version          INTEGER NOT NULL DEFAULT 1,
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT disbursements_amount_positive CHECK (amount > 0),
    CONSTRAINT disbursements_conversion_complete CHECK
        (amount_base IS NULL OR (exchange_rate IS NOT NULL
            AND exchange_rate_source IS NOT NULL AND exchange_rate_date IS NOT NULL)),
    CONSTRAINT disbursements_approver_differs CHECK
        (approved_by IS NULL OR approved_by <> created_by),
    CONSTRAINT disbursements_bank_ref_unique UNIQUE (tenant_id, grant_id, bank_reference)
);

CREATE INDEX idx_disbursements_grant ON disbursements (grant_id) WHERE NOT is_deleted;
CREATE INDEX idx_disbursements_date ON disbursements (tenant_id, received_date DESC);
CREATE INDEX idx_disbursements_unreconciled ON disbursements (tenant_id)
    WHERE status IN ('recorded','approved') AND reconciled_at IS NULL;
```

The `disbursements_approver_differs` check enforces maker-checker at the database level, not only in application code — a control that survives an application bug.

```sql
CREATE TABLE grant_report_periods (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    grant_id       UUID NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
    period_label   VARCHAR(80) NOT NULL,
    period_start   DATE NOT NULL,
    period_end     DATE NOT NULL,
    due_date       DATE NOT NULL,
    report_type    VARCHAR(40) NOT NULL,
    is_mandatory   BOOLEAN NOT NULL DEFAULT TRUE,
    reminder_sent_at TIMESTAMPTZ,
    escalated_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version        INTEGER NOT NULL DEFAULT 1,
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT report_periods_valid CHECK (period_end >= period_start),
    CONSTRAINT report_periods_due_after_end CHECK (due_date >= period_end),
    CONSTRAINT report_periods_type_valid CHECK (report_type IN
        ('narrative','financial','combined','final','audit','ad_hoc')),
    CONSTRAINT report_periods_unique UNIQUE (grant_id, period_label, report_type)
);

CREATE INDEX idx_report_periods_due ON grant_report_periods (tenant_id, due_date)
    WHERE NOT is_deleted;

CREATE TABLE grant_reports (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id),
    grant_id          UUID NOT NULL REFERENCES grants(id) ON DELETE RESTRICT,
    report_period_id  UUID REFERENCES grant_report_periods(id),
    title             VARCHAR(300) NOT NULL,
    submitted_date    DATE,
    submitted_by      UUID REFERENCES users(id),
    accepted_date     DATE,
    file_id           UUID,
    narrative_summary TEXT,
    status            VARCHAR(30) NOT NULL DEFAULT 'draft',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version           INTEGER NOT NULL DEFAULT 1,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT grant_reports_status_valid CHECK (status IN
        ('draft','submitted','accepted','revision_requested','rejected'))
);

CREATE TABLE grant_activities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    grant_id        UUID NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
    parent_activity_id UUID REFERENCES grant_activities(id),
    activity_code   VARCHAR(50) NOT NULL,
    title           VARCHAR(300) NOT NULL,
    description     TEXT,
    logframe_level  VARCHAR(20),
    indicator_name  VARCHAR(300),
    target_value    NUMERIC(15,2),
    achieved_value  NUMERIC(15,2) NOT NULL DEFAULT 0,
    unit_of_measure VARCHAR(50),
    planned_start   DATE,
    planned_end     DATE,
    status          VARCHAR(30) NOT NULL DEFAULT 'planned',
    evidence_count  INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version         INTEGER NOT NULL DEFAULT 1,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT grant_activities_code_unique UNIQUE (grant_id, activity_code),
    CONSTRAINT grant_activities_level_valid CHECK (logframe_level IN
        ('goal','outcome','output','activity')),
    CONSTRAINT grant_activities_status_valid CHECK (status IN
        ('planned','in_progress','completed','cancelled','delayed'))
);

CREATE TABLE grant_compliance_snapshots (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    grant_id       UUID NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
    snapshot_date  DATE NOT NULL,
    score          NUMERIC(5,2) NOT NULL,
    factor_breakdown JSONB NOT NULL,
    algorithm_version VARCHAR(20) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT compliance_snapshot_unique UNIQUE (grant_id, snapshot_date),
    CONSTRAINT compliance_score_range CHECK (score BETWEEN 0 AND 100)
);

CREATE TABLE expenditures (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    budget_line_id  UUID NOT NULL REFERENCES budget_lines(id) ON DELETE RESTRICT,
    grant_id        UUID NOT NULL REFERENCES grants(id),
    amount          NUMERIC(15,2) NOT NULL,
    currency        CHAR(3) NOT NULL,
    expenditure_date DATE NOT NULL,
    source_type     VARCHAR(40) NOT NULL,
    source_reference VARCHAR(200),
    description     VARCHAR(500),
    is_reversal     BOOLEAN NOT NULL DEFAULT FALSE,
    reverses_id     UUID REFERENCES expenditures(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id),
    version         INTEGER NOT NULL DEFAULT 1,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT expenditures_source_valid CHECK (source_type IN
        ('payroll','procurement','direct_cost','indirect_cost','adjustment')),
    CONSTRAINT expenditures_reversal_consistent CHECK
        ((is_reversal AND reverses_id IS NOT NULL) OR (NOT is_reversal AND reverses_id IS NULL))
);

CREATE INDEX idx_expenditures_line ON expenditures (budget_line_id) WHERE NOT is_deleted;
CREATE INDEX idx_expenditures_grant_date ON expenditures (grant_id, expenditure_date DESC);
```

---

## 8.4 Schema: People Operations

### 8.4.1 Shared schema tables

```sql
CREATE TABLE departments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    parent_id     UUID REFERENCES departments(id),
    code          VARCHAR(30) NOT NULL,
    name          VARCHAR(200) NOT NULL,
    cost_centre   VARCHAR(50),
    manager_employee_id UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version       INTEGER NOT NULL DEFAULT 1,
    is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT departments_code_unique UNIQUE (tenant_id, code),
    CONSTRAINT departments_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE positions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    department_id   UUID NOT NULL REFERENCES departments(id),
    title           VARCHAR(200) NOT NULL,
    grade           VARCHAR(20),
    reports_to_position_id UUID REFERENCES positions(id),
    is_supervisory  BOOLEAN NOT NULL DEFAULT FALSE,
    headcount_budgeted SMALLINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version         INTEGER NOT NULL DEFAULT 1,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE employees (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id             UUID REFERENCES users(id),
    employee_number     VARCHAR(30) NOT NULL,
    first_name_encrypted BYTEA NOT NULL,
    last_name_encrypted  BYTEA NOT NULL,
    display_name        VARCHAR(200) NOT NULL,
    name_blind_index    VARCHAR(64) NOT NULL,
    dob_encrypted       BYTEA,
    sex                 CHAR(1),
    nationality         CHAR(2) NOT NULL,
    personal_email_encrypted BYTEA,
    phone_encrypted     BYTEA,
    emergency_contact_encrypted BYTEA,
    department_id       UUID NOT NULL REFERENCES departments(id),
    position_id         UUID REFERENCES positions(id),
    line_manager_id     UUID REFERENCES employees(id),
    employment_type     VARCHAR(30) NOT NULL,
    status              emp_status NOT NULL DEFAULT 'pending',
    hire_date           DATE NOT NULL,
    probation_end_date  DATE,
    termination_date    DATE,
    termination_reason  VARCHAR(100),
    duty_station        VARCHAR(120),
    payroll_country     CHAR(2) NOT NULL,
    nra_tin_encrypted   BYTEA,
    nsif_number_encrypted BYTEA,
    ura_tin_encrypted   BYTEA,
    nssf_number_encrypted BYTEA,
    bank_details_encrypted BYTEA,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID REFERENCES users(id),
    updated_by          UUID REFERENCES users(id),
    version             INTEGER NOT NULL DEFAULT 1,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at          TIMESTAMPTZ,
    deleted_by          UUID REFERENCES users(id),

    CONSTRAINT employees_number_per_tenant UNIQUE (tenant_id, employee_number),
    CONSTRAINT employees_user_unique UNIQUE (user_id),
    CONSTRAINT employees_type_valid CHECK (employment_type IN
        ('national_staff','international','volunteer','consultant','intern','seconded')),
    CONSTRAINT employees_termination_consistent CHECK
        ((status = 'terminated' AND termination_date IS NOT NULL)
         OR (status <> 'terminated')),
    CONSTRAINT employees_termination_after_hire CHECK
        (termination_date IS NULL OR termination_date >= hire_date),
    CONSTRAINT employees_no_self_manager CHECK (line_manager_id IS NULL OR line_manager_id <> id),
    CONSTRAINT employees_sex_valid CHECK (sex IS NULL OR sex IN ('M','F','O'))
);

CREATE INDEX idx_employees_tenant_status ON employees (tenant_id, status) WHERE NOT is_deleted;
CREATE INDEX idx_employees_department ON employees (department_id) WHERE NOT is_deleted;
CREATE INDEX idx_employees_manager ON employees (line_manager_id) WHERE line_manager_id IS NOT NULL;
CREATE INDEX idx_employees_blind_index ON employees (tenant_id, name_blind_index);
CREATE INDEX idx_employees_payroll_country ON employees (tenant_id, payroll_country)
    WHERE status = 'active';
```

> **Correction to v1.0.** v1.0's `employees` table had no `tenant_id`, which would have left the most sensitive table in the platform outside the RLS model entirely. It also declared `employee_number VARCHAR(30) UNIQUE` globally, which would cause cross-tenant collisions and leak the existence of other tenants through constraint violations. Both are fixed. Personal fields that were plain text in v1.0 are now encrypted `BYTEA`; `display_name` holds a non-sensitive form for list rendering, and `name_blind_index` supports exact search without decryption.

```sql
CREATE TABLE contracts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id),
    employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    contract_number   VARCHAR(50) NOT NULL,
    contract_type     VARCHAR(40) NOT NULL,
    start_date        DATE NOT NULL,
    end_date          DATE,
    gross_salary      NUMERIC(15,2) NOT NULL,
    salary_currency   CHAR(3) NOT NULL,
    payment_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
    allowances        JSONB NOT NULL DEFAULT '[]'::jsonb,
    working_hours_per_week NUMERIC(5,2),
    annual_leave_days SMALLINT,
    notice_period_days SMALLINT,
    status            contract_status NOT NULL DEFAULT 'draft',
    signed_date       DATE,
    file_id           UUID,
    supersedes_id     UUID REFERENCES contracts(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version           INTEGER NOT NULL DEFAULT 1,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT contracts_number_unique UNIQUE (tenant_id, contract_number),
    CONSTRAINT contracts_period_valid CHECK (end_date IS NULL OR end_date > start_date),
    CONSTRAINT contracts_salary_positive CHECK (gross_salary > 0),
    CONSTRAINT contracts_type_valid CHECK (contract_type IN
        ('fixed_term','open_ended','consultancy','volunteer','internship','secondment')),
    CONSTRAINT contracts_frequency_valid CHECK (payment_frequency IN
        ('monthly','biweekly','weekly','daily','lump_sum'))
);

-- One active contract per employee at a time, enforced by the database
-- rather than by hopeful application logic.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE contracts ADD CONSTRAINT contracts_no_overlap
    EXCLUDE USING GIST (
        employee_id WITH =,
        daterange(start_date, COALESCE(end_date, 'infinity'::date), '[]') WITH &&
    ) WHERE (status IN ('active','expiring') AND NOT is_deleted);

CREATE INDEX idx_contracts_employee ON contracts (employee_id) WHERE NOT is_deleted;
CREATE INDEX idx_contracts_expiring ON contracts (tenant_id, end_date)
    WHERE status = 'active' AND end_date IS NOT NULL;

CREATE TABLE leave_types (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    code           VARCHAR(30) NOT NULL,
    name           VARCHAR(100) NOT NULL,
    annual_entitlement_days NUMERIC(5,2),
    is_paid        BOOLEAN NOT NULL DEFAULT TRUE,
    accrual_method VARCHAR(20) NOT NULL DEFAULT 'annual',
    carryover_max_days NUMERIC(5,2) NOT NULL DEFAULT 0,
    requires_document BOOLEAN NOT NULL DEFAULT FALSE,
    applies_to_sex CHAR(1),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version        INTEGER NOT NULL DEFAULT 1,
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT leave_types_code_unique UNIQUE (tenant_id, code),
    CONSTRAINT leave_accrual_valid CHECK (accrual_method IN ('annual','monthly','none'))
);

CREATE TABLE leave_balances (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id  UUID NOT NULL REFERENCES leave_types(id),
    leave_year     INTEGER NOT NULL,
    entitlement_days NUMERIC(5,2) NOT NULL DEFAULT 0,
    carried_over_days NUMERIC(5,2) NOT NULL DEFAULT 0,
    accrued_days   NUMERIC(5,2) NOT NULL DEFAULT 0,
    taken_days     NUMERIC(5,2) NOT NULL DEFAULT 0,
    pending_days   NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version        INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT leave_balance_unique UNIQUE (employee_id, leave_type_id, leave_year),
    CONSTRAINT leave_balance_non_negative CHECK
        (accrued_days + carried_over_days - taken_days - pending_days >= -0.01)
);

CREATE TABLE leave_requests (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type_id  UUID NOT NULL REFERENCES leave_types(id),
    start_date     DATE NOT NULL,
    end_date       DATE NOT NULL,
    days_requested NUMERIC(5,2) NOT NULL,
    reason         TEXT,
    document_file_id UUID,
    status         VARCHAR(20) NOT NULL DEFAULT 'pending',
    approved_by    UUID REFERENCES users(id),
    approved_at    TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version        INTEGER NOT NULL DEFAULT 1,
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT leave_period_valid CHECK (end_date >= start_date),
    CONSTRAINT leave_days_positive CHECK (days_requested > 0),
    CONSTRAINT leave_status_valid CHECK (status IN
        ('pending','approved','rejected','cancelled','taken'))
);

CREATE INDEX idx_leave_requests_employee ON leave_requests (employee_id, start_date DESC);
CREATE INDEX idx_leave_requests_pending ON leave_requests (tenant_id)
    WHERE status = 'pending' AND NOT is_deleted;
```

### 8.4.2 Statutory rule tables

These implement PRIN-04. They are shared across tenants operating in the same country, seeded centrally, and effective-dated.

```sql
CREATE TABLE tax_bands (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code    CHAR(2) NOT NULL,
    tax_type        VARCHAR(30) NOT NULL,
    band_order      SMALLINT NOT NULL,
    lower_bound     NUMERIC(15,2) NOT NULL,
    upper_bound     NUMERIC(15,2),
    rate_percent    NUMERIC(6,3) NOT NULL,
    fixed_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency        CHAR(3) NOT NULL,
    period_basis    VARCHAR(20) NOT NULL DEFAULT 'monthly',
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    legal_reference VARCHAR(300),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id),
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,

    CONSTRAINT tax_bands_unique UNIQUE (country_code, tax_type, band_order, effective_from),
    CONSTRAINT tax_bands_bounds_valid CHECK (upper_bound IS NULL OR upper_bound > lower_bound),
    CONSTRAINT tax_bands_rate_valid CHECK (rate_percent BETWEEN 0 AND 100),
    CONSTRAINT tax_bands_effective_valid CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT tax_bands_dual_authorised CHECK (approved_by IS NULL OR approved_by <> created_by)
);

CREATE INDEX idx_tax_bands_lookup ON tax_bands
    (country_code, tax_type, effective_from DESC, band_order);

CREATE TABLE statutory_contribution_rates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code      CHAR(2) NOT NULL,
    scheme_code       VARCHAR(20) NOT NULL,
    scheme_name       VARCHAR(100) NOT NULL,
    employee_rate_percent NUMERIC(6,3) NOT NULL,
    employer_rate_percent NUMERIC(6,3) NOT NULL,
    contribution_base VARCHAR(30) NOT NULL DEFAULT 'gross',
    floor_amount      NUMERIC(15,2),
    ceiling_amount    NUMERIC(15,2),
    currency          CHAR(3) NOT NULL,
    applies_to_types  TEXT[],
    effective_from    DATE NOT NULL,
    effective_to      DATE,
    legal_reference   VARCHAR(300),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by        UUID REFERENCES users(id),
    approved_by       UUID REFERENCES users(id),
    approved_at       TIMESTAMPTZ,

    CONSTRAINT contribution_rates_unique UNIQUE (country_code, scheme_code, effective_from),
    CONSTRAINT contribution_rates_valid CHECK
        (employee_rate_percent >= 0 AND employer_rate_percent >= 0),
    CONSTRAINT contribution_ceiling_valid CHECK
        (ceiling_amount IS NULL OR floor_amount IS NULL OR ceiling_amount > floor_amount),
    CONSTRAINT contribution_dual_authorised CHECK (approved_by IS NULL OR approved_by <> created_by)
);

CREATE TABLE fx_rates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency CHAR(3) NOT NULL,
    quote_currency CHAR(3) NOT NULL,
    rate          NUMERIC(18,8) NOT NULL,
    rate_source   VARCHAR(80) NOT NULL,
    rate_date     DATE NOT NULL,
    is_official   BOOLEAN NOT NULL DEFAULT TRUE,
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fx_rate_unique UNIQUE (base_currency, quote_currency, rate_date, rate_source),
    CONSTRAINT fx_rate_positive CHECK (rate > 0)
);

CREATE INDEX idx_fx_rates_lookup ON fx_rates
    (base_currency, quote_currency, rate_date DESC) WHERE is_official;
```

### 8.4.3 Per-tenant payroll schema

Created by `tenant-service` during provisioning as `tenant_<slug>`. The service role is granted access only to the schemas of tenants it is serving, resolved per request.

```sql
-- Executed against tenant_<slug>
CREATE TABLE payroll_runs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL,
    run_reference         VARCHAR(50) NOT NULL,
    country_code          CHAR(2) NOT NULL,
    pay_period_start      DATE NOT NULL,
    pay_period_end        DATE NOT NULL,
    payment_date          DATE,
    status                payroll_status NOT NULL DEFAULT 'draft',
    employee_count        INTEGER NOT NULL DEFAULT 0,
    total_gross_usd       NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_gross_local     NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_paye_local      NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_social_employee NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_social_employer NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_net_usd         NUMERIC(15,2) NOT NULL DEFAULT 0,
    local_currency        CHAR(3) NOT NULL,
    exchange_rate         NUMERIC(18,8) NOT NULL,
    exchange_rate_source  VARCHAR(80) NOT NULL,
    exchange_rate_date    DATE NOT NULL,
    rate_override_reason  TEXT,
    tax_ruleset_hash      VARCHAR(64) NOT NULL,
    prepared_by           UUID NOT NULL,
    prepared_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by           UUID,
    approved_at           TIMESTAMPTZ,
    reversed_by_run_id    UUID REFERENCES payroll_runs(id),
    computation_state     JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version               INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT payroll_run_reference_unique UNIQUE (run_reference),
    CONSTRAINT payroll_period_valid CHECK (pay_period_end >= pay_period_start),
    CONSTRAINT payroll_approver_differs CHECK (approved_by IS NULL OR approved_by <> prepared_by),
    CONSTRAINT payroll_approved_has_timestamp CHECK
        ((status IN ('approved','disbursed') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
         OR status NOT IN ('approved','disbursed')),
    CONSTRAINT payroll_rate_positive CHECK (exchange_rate > 0)
);

-- One payroll run per period per country. A duplicate run is the
-- single most damaging payroll error and is prevented structurally.
CREATE UNIQUE INDEX idx_payroll_run_period_unique ON payroll_runs
    (country_code, pay_period_start, pay_period_end)
    WHERE status NOT IN ('reversed','failed');

CREATE TABLE payroll_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    payroll_run_id      UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id         UUID NOT NULL,
    employee_number     VARCHAR(30) NOT NULL,
    contract_id         UUID NOT NULL,
    gross_salary_usd    NUMERIC(15,2) NOT NULL,
    allowances_usd      NUMERIC(15,2) NOT NULL DEFAULT 0,
    gross_total_usd     NUMERIC(15,2) NOT NULL,
    gross_total_local   NUMERIC(15,2) NOT NULL,
    taxable_income_local NUMERIC(15,2) NOT NULL,
    paye_local          NUMERIC(15,2) NOT NULL DEFAULT 0,
    social_employee_local NUMERIC(15,2) NOT NULL DEFAULT 0,
    social_employer_local NUMERIC(15,2) NOT NULL DEFAULT 0,
    other_deductions_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_pay_usd         NUMERIC(15,2) NOT NULL,
    net_pay_local       NUMERIC(15,2) NOT NULL,
    days_worked         NUMERIC(5,2),
    unpaid_leave_days   NUMERIC(5,2) NOT NULL DEFAULT 0,
    payslip_file_id     UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT payroll_record_unique UNIQUE (payroll_run_id, employee_id),
    CONSTRAINT payroll_net_not_negative CHECK (net_pay_usd >= 0),
    CONSTRAINT payroll_gross_consistent CHECK
        (ABS(gross_total_usd - (gross_salary_usd + allowances_usd)) < 0.01)
);

CREATE INDEX idx_payroll_records_run ON payroll_records (payroll_run_id);
CREATE INDEX idx_payroll_records_employee ON payroll_records (employee_id, created_at DESC);

-- Every computed figure with the inputs that produced it, so any
-- payslip line can be explained without re-running the calculation.
CREATE TABLE payroll_record_lines (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_record_id UUID NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
    line_type         VARCHAR(40) NOT NULL,
    line_code         VARCHAR(40) NOT NULL,
    description       VARCHAR(200) NOT NULL,
    amount            NUMERIC(15,2) NOT NULL,
    currency          CHAR(3) NOT NULL,
    calculation_basis NUMERIC(15,2),
    rate_applied      NUMERIC(8,4),
    rule_reference_id UUID,
    rule_table        VARCHAR(50),
    display_order     SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT payroll_line_type_valid CHECK (line_type IN
        ('earning','statutory_deduction','voluntary_deduction','employer_contribution','information'))
);

CREATE INDEX idx_payroll_lines_record ON payroll_record_lines (payroll_record_id, display_order);

CREATE TABLE payroll_cost_allocations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    payroll_record_id UUID NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
    grant_id          UUID NOT NULL,
    budget_line_id    UUID NOT NULL,
    allocation_percent NUMERIC(5,2) NOT NULL,
    allocated_amount_usd NUMERIC(15,2) NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT allocation_percent_valid CHECK (allocation_percent > 0 AND allocation_percent <= 100)
);

CREATE INDEX idx_cost_allocations_grant ON payroll_cost_allocations (grant_id, budget_line_id);
```

An approved `payroll_runs` row is protected by a trigger that rejects any update other than the `status` transition to `disbursed` or the setting of `reversed_by_run_id`.

---

## 8.5 Schema: Beneficiary and Programme

```sql
CREATE TABLE households (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    household_code        VARCHAR(30) NOT NULL,
    head_beneficiary_id   UUID,
    member_count          SMALLINT NOT NULL DEFAULT 1,
    female_headed         BOOLEAN NOT NULL DEFAULT FALSE,
    children_under_5      SMALLINT NOT NULL DEFAULT 0,
    children_5_17         SMALLINT NOT NULL DEFAULT 0,
    adults_18_59          SMALLINT NOT NULL DEFAULT 0,
    elderly_60_plus       SMALLINT NOT NULL DEFAULT 0,
    persons_with_disability SMALLINT NOT NULL DEFAULT 0,
    chronic_illness_present BOOLEAN NOT NULL DEFAULT FALSE,
    hfias_score           SMALLINT,
    hfias_category        VARCHAR(30),
    primary_income_source VARCHAR(60),
    shelter_type          VARCHAR(40),
    location_gps          GEOGRAPHY(Point, 4326),
    location_admin1       VARCHAR(100),
    location_admin2       VARCHAR(100),
    location_settlement   VARCHAR(150),
    registration_date     DATE NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by            UUID REFERENCES users(id),
    updated_by            UUID REFERENCES users(id),
    version               INTEGER NOT NULL DEFAULT 1,
    is_deleted            BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT households_code_unique UNIQUE (tenant_id, household_code),
    CONSTRAINT households_counts_non_negative CHECK
        (member_count >= 0 AND children_under_5 >= 0 AND children_5_17 >= 0
         AND adults_18_59 >= 0 AND elderly_60_plus >= 0),
    CONSTRAINT households_hfias_range CHECK (hfias_score IS NULL OR hfias_score BETWEEN 0 AND 27),
    CONSTRAINT households_hfias_category_valid CHECK (hfias_category IS NULL OR hfias_category IN
        ('food_secure','mildly_insecure','moderately_insecure','severely_insecure'))
);

CREATE INDEX idx_households_tenant ON households (tenant_id) WHERE NOT is_deleted;
CREATE INDEX idx_households_location ON households USING GIST (location_gps);
CREATE INDEX idx_households_settlement ON households (tenant_id, location_settlement);

CREATE TABLE beneficiaries (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    unique_id            VARCHAR(30) NOT NULL,
    household_id         UUID REFERENCES households(id),
    relationship_to_head VARCHAR(40),
    first_name_encrypted BYTEA NOT NULL,
    last_name_encrypted  BYTEA NOT NULL,
    name_blind_index     VARCHAR(64) NOT NULL,
    name_phonetic_index  VARCHAR(64),
    dob_encrypted        BYTEA,
    estimated_age        SMALLINT,
    age_group            VARCHAR(20),
    sex                  CHAR(1) NOT NULL,
    disability_status    VARCHAR(40),
    displacement_status  VARCHAR(20) NOT NULL,
    displacement_date    DATE,
    origin_admin1        VARCHAR(100),
    phone_encrypted      BYTEA,
    national_id_encrypted BYTEA,
    national_id_blind_index VARCHAR(64),
    vulnerability_score  NUMERIC(5,2),
    vulnerability_scored_at TIMESTAMPTZ,
    location_gps         GEOGRAPHY(Point, 4326),
    location_admin1      VARCHAR(100),
    location_admin2      VARCHAR(100),
    location_settlement  VARCHAR(150),
    registration_date    DATE NOT NULL,
    registered_by        UUID NOT NULL REFERENCES users(id),
    registration_submission_id UUID,
    status               VARCHAR(20) NOT NULL DEFAULT 'active',
    merged_into_id       UUID REFERENCES beneficiaries(id),
    erased_at            TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           UUID REFERENCES users(id),
    updated_by           UUID REFERENCES users(id),
    version              INTEGER NOT NULL DEFAULT 1,
    is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at           TIMESTAMPTZ,
    deleted_by           UUID REFERENCES users(id),

    CONSTRAINT beneficiaries_unique_id_per_tenant UNIQUE (tenant_id, unique_id),
    CONSTRAINT beneficiaries_unique_id_format CHECK (unique_id ~ '^[A-Z]{2,6}-[0-9]{4}-[0-9]{5}$'),
    CONSTRAINT beneficiaries_sex_valid CHECK (sex IN ('M','F','O')),
    CONSTRAINT beneficiaries_displacement_valid CHECK (displacement_status IN
        ('host_community','idp','refugee','returnee','asylum_seeker','stateless')),
    CONSTRAINT beneficiaries_age_known CHECK (dob_encrypted IS NOT NULL OR estimated_age IS NOT NULL),
    CONSTRAINT beneficiaries_age_range CHECK (estimated_age IS NULL OR estimated_age BETWEEN 0 AND 120),
    CONSTRAINT beneficiaries_score_range CHECK
        (vulnerability_score IS NULL OR vulnerability_score BETWEEN 0 AND 100),
    CONSTRAINT beneficiaries_status_valid CHECK (status IN
        ('active','inactive','exited','deceased','merged','erased')),
    CONSTRAINT beneficiaries_merge_consistent CHECK
        ((status = 'merged' AND merged_into_id IS NOT NULL) OR status <> 'merged'),
    CONSTRAINT beneficiaries_no_self_merge CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE INDEX idx_beneficiaries_tenant_status ON beneficiaries (tenant_id, status)
    WHERE NOT is_deleted;
CREATE INDEX idx_beneficiaries_household ON beneficiaries (household_id)
    WHERE household_id IS NOT NULL;
CREATE INDEX idx_beneficiaries_blind_index ON beneficiaries (tenant_id, name_blind_index);
CREATE INDEX idx_beneficiaries_phonetic ON beneficiaries (tenant_id, name_phonetic_index)
    WHERE name_phonetic_index IS NOT NULL;
CREATE INDEX idx_beneficiaries_national_id ON beneficiaries (tenant_id, national_id_blind_index)
    WHERE national_id_blind_index IS NOT NULL;
CREATE INDEX idx_beneficiaries_location ON beneficiaries USING GIST (location_gps);
CREATE INDEX idx_beneficiaries_vulnerability ON beneficiaries (tenant_id, vulnerability_score DESC)
    WHERE status = 'active' AND NOT is_deleted;
CREATE INDEX idx_beneficiaries_settlement ON beneficiaries (tenant_id, location_settlement)
    WHERE status = 'active';
```

> **Correction to v1.0.** `unique_id VARCHAR(30) UNIQUE` was globally unique in v1.0, meaning tenant B's `BEN-2024-00001` would collide with tenant A's and the resulting constraint violation would disclose that another tenant holds that identifier. It is now unique per tenant. All directly identifying fields are encrypted; `name_blind_index` (HMAC of the normalised name under a per-tenant key) supports exact lookup and `name_phonetic_index` (double metaphone of the normalised name) supports fuzzy duplicate detection, both without decrypting the corpus.

```sql
CREATE TABLE vulnerability_assessments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id),
    beneficiary_id    UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
    household_id      UUID REFERENCES households(id),
    score             NUMERIC(5,2) NOT NULL,
    raw_score         NUMERIC(6,2) NOT NULL,
    max_possible_score NUMERIC(6,2) NOT NULL,
    factor_breakdown  JSONB NOT NULL,
    algorithm_version VARCHAR(20) NOT NULL,
    is_current        BOOLEAN NOT NULL DEFAULT TRUE,
    assessed_date     DATE NOT NULL,
    assessed_by       UUID REFERENCES users(id),
    trigger_reason    VARCHAR(60),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT assessment_score_range CHECK (score BETWEEN 0 AND 100),
    CONSTRAINT assessment_max_positive CHECK (max_possible_score > 0)
);

CREATE UNIQUE INDEX idx_assessment_one_current ON vulnerability_assessments (beneficiary_id)
    WHERE is_current;
CREATE INDEX idx_assessments_beneficiary ON vulnerability_assessments
    (beneficiary_id, assessed_date DESC);

CREATE TABLE beneficiary_consents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id),
    beneficiary_id    UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
    consent_type      VARCHAR(40) NOT NULL,
    granted           BOOLEAN NOT NULL,
    purpose_statement TEXT NOT NULL,
    consent_method    VARCHAR(30) NOT NULL,
    consent_language  VARCHAR(10) NOT NULL,
    witnessed_by      VARCHAR(200),
    obtained_by       UUID NOT NULL REFERENCES users(id),
    obtained_at       TIMESTAMPTZ NOT NULL,
    withdrawn_at      TIMESTAMPTZ,
    evidence_file_id  UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT consent_type_valid CHECK (consent_type IN
        ('data_collection','data_sharing_donor','data_sharing_partner','photography','follow_up_contact')),
    CONSTRAINT consent_method_valid CHECK (consent_method IN
        ('verbal_witnessed','written_signature','thumbprint','digital_signature'))
);

CREATE INDEX idx_consents_beneficiary ON beneficiary_consents (beneficiary_id, consent_type);

CREATE TABLE programmes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    grant_id            UUID,
    code                VARCHAR(40) NOT NULL,
    name                VARCHAR(300) NOT NULL,
    description         TEXT,
    sector              VARCHAR(60) NOT NULL,
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    eligibility_criteria JSONB,
    target_beneficiaries INTEGER,
    enrolled_count      INTEGER NOT NULL DEFAULT 0,
    location_admin1     VARCHAR(100),
    location_admin2     VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'planned',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version             INTEGER NOT NULL DEFAULT 1,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT programmes_code_unique UNIQUE (tenant_id, code),
    CONSTRAINT programmes_period_valid CHECK (end_date >= start_date),
    CONSTRAINT programmes_status_valid CHECK (status IN
        ('planned','active','suspended','completed','cancelled'))
);

CREATE TABLE programme_enrollments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    programme_id        UUID NOT NULL REFERENCES programmes(id) ON DELETE RESTRICT,
    beneficiary_id      UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE RESTRICT,
    household_id        UUID REFERENCES households(id),
    enrolled_date       DATE NOT NULL,
    eligibility_basis   VARCHAR(120) NOT NULL,
    vulnerability_score_at_entry NUMERIC(5,2),
    enrolled_by         UUID NOT NULL REFERENCES users(id),
    exit_date           DATE,
    exit_reason         VARCHAR(60),
    status              VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version             INTEGER NOT NULL DEFAULT 1,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT enrollment_unique_active UNIQUE (programme_id, beneficiary_id),
    CONSTRAINT enrollment_exit_valid CHECK (exit_date IS NULL OR exit_date >= enrolled_date),
    CONSTRAINT enrollment_status_valid CHECK (status IN
        ('active','exited','suspended','graduated','transferred'))
);

CREATE INDEX idx_prog_enrollments_programme ON programme_enrollments (programme_id)
    WHERE status = 'active' AND NOT is_deleted;
CREATE INDEX idx_prog_enrollments_beneficiary ON programme_enrollments (beneficiary_id);

CREATE TABLE programme_activities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    programme_id    UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
    grant_activity_id UUID,
    code            VARCHAR(40) NOT NULL,
    name            VARCHAR(300) NOT NULL,
    activity_type   VARCHAR(50) NOT NULL,
    scheduled_date  DATE NOT NULL,
    completed_date  DATE,
    location_gps    GEOGRAPHY(Point, 4326),
    location_settlement VARCHAR(150),
    expected_participants INTEGER,
    actual_participants INTEGER NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version         INTEGER NOT NULL DEFAULT 1,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT prog_activity_code_unique UNIQUE (programme_id, code)
);

CREATE TABLE attendance_records (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              UUID NOT NULL REFERENCES tenants(id),
    programme_activity_id  UUID NOT NULL REFERENCES programme_activities(id) ON DELETE CASCADE,
    programme_enrollment_id UUID NOT NULL REFERENCES programme_enrollments(id) ON DELETE RESTRICT,
    beneficiary_id         UUID NOT NULL REFERENCES beneficiaries(id),
    attended               BOOLEAN NOT NULL DEFAULT TRUE,
    assistance_type        VARCHAR(60),
    quantity               NUMERIC(12,2),
    unit                   VARCHAR(30),
    recorded_by            UUID NOT NULL REFERENCES users(id),
    recorded_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submission_id          UUID,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT attendance_unique UNIQUE (programme_activity_id, beneficiary_id)
);

CREATE INDEX idx_attendance_activity ON attendance_records (programme_activity_id);
CREATE INDEX idx_attendance_beneficiary ON attendance_records (beneficiary_id, recorded_at DESC);

CREATE TABLE beneficiary_merge_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id),
    surviving_id     UUID NOT NULL REFERENCES beneficiaries(id),
    merged_id        UUID NOT NULL REFERENCES beneficiaries(id),
    match_score      NUMERIC(5,2),
    match_basis      JSONB,
    merged_snapshot  JSONB NOT NULL,
    performed_by     UUID NOT NULL REFERENCES users(id),
    approved_by      UUID NOT NULL REFERENCES users(id),
    performed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversible_until TIMESTAMPTZ NOT NULL,
    reversed_at      TIMESTAMPTZ,

    CONSTRAINT merge_dual_auth CHECK (approved_by <> performed_by),
    CONSTRAINT merge_not_self CHECK (surviving_id <> merged_id)
);
```

`merged_snapshot` holds the complete pre-merge record, which is what makes the 30-day reversal window possible. Merging beneficiaries incorrectly can exclude a real person from assistance, so reversibility is a protection control, not a convenience.

---

## 8.6 Schema: Field Data

```sql
CREATE TABLE form_templates (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id),
    code         VARCHAR(50) NOT NULL,
    name         VARCHAR(200) NOT NULL,
    description  TEXT,
    category     VARCHAR(50),
    current_version_id UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version      INTEGER NOT NULL DEFAULT 1,
    is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT form_templates_code_unique UNIQUE (tenant_id, code)
);

CREATE TABLE form_template_versions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id),
    form_template_id  UUID NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
    version_number    INTEGER NOT NULL,
    schema            JSONB NOT NULL,
    schema_checksum   VARCHAR(64) NOT NULL,
    is_published      BOOLEAN NOT NULL DEFAULT FALSE,
    published_at      TIMESTAMPTZ,
    published_by      UUID REFERENCES users(id),
    retired_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT form_version_unique UNIQUE (form_template_id, version_number),
    CONSTRAINT form_published_has_timestamp CHECK
        (NOT is_published OR published_at IS NOT NULL)
);

CREATE TABLE form_fields (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL REFERENCES tenants(id),
    form_template_version_id UUID NOT NULL REFERENCES form_template_versions(id) ON DELETE CASCADE,
    field_key                VARCHAR(80) NOT NULL,
    label                    VARCHAR(300) NOT NULL,
    help_text                TEXT,
    type                     field_type NOT NULL,
    display_order            INTEGER NOT NULL,
    group_name               VARCHAR(80),
    is_required              BOOLEAN NOT NULL DEFAULT FALSE,
    is_pii                   BOOLEAN NOT NULL DEFAULT FALSE,
    is_fingerprint_component BOOLEAN NOT NULL DEFAULT FALSE,
    maps_to_entity           VARCHAR(50),
    maps_to_attribute        VARCHAR(50),
    options                  JSONB,
    default_value            TEXT,
    visibility_condition     JSONB,

    CONSTRAINT form_field_key_unique UNIQUE (form_template_version_id, field_key),
    CONSTRAINT form_field_key_format CHECK (field_key ~ '^[a-z][a-z0-9_]{0,79}$')
);

CREATE INDEX idx_form_fields_version ON form_fields (form_template_version_id, display_order);

CREATE TABLE field_validation_rules (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    form_field_id  UUID NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
    rule_type      VARCHAR(40) NOT NULL,
    rule_config    JSONB NOT NULL,
    error_message  VARCHAR(300) NOT NULL,
    severity       VARCHAR(10) NOT NULL DEFAULT 'error',

    CONSTRAINT validation_rule_type_valid CHECK (rule_type IN
        ('min','max','min_length','max_length','pattern','required_if',
         'cross_field','unique_within_form','date_range','gps_bounds','custom')),
    CONSTRAINT validation_severity_valid CHECK (severity IN ('error','warning'))
);

CREATE TABLE form_assignments (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL REFERENCES tenants(id),
    form_template_version_id UUID NOT NULL REFERENCES form_template_versions(id),
    assigned_to_user_id      UUID REFERENCES users(id),
    assigned_to_role         VARCHAR(50),
    programme_id             UUID,
    location_scope           VARCHAR(150),
    valid_from               DATE NOT NULL,
    valid_to                 DATE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT assignment_has_target CHECK
        (assigned_to_user_id IS NOT NULL OR assigned_to_role IS NOT NULL)
);

CREATE TABLE sync_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id),
    user_id          UUID NOT NULL REFERENCES users(id),
    device_id        VARCHAR(80) NOT NULL,
    client_version   VARCHAR(20),
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,
    submissions_sent INTEGER NOT NULL DEFAULT 0,
    submissions_accepted INTEGER NOT NULL DEFAULT 0,
    submissions_rejected INTEGER NOT NULL DEFAULT 0,
    submissions_flagged  INTEGER NOT NULL DEFAULT 0,
    bytes_uploaded   BIGINT NOT NULL DEFAULT 0,
    offline_duration_hours NUMERIC(8,2),
    network_type     VARCHAR(20),
    outcome          VARCHAR(20) NOT NULL DEFAULT 'in_progress'
);

CREATE INDEX idx_sync_sessions_user ON sync_sessions (user_id, started_at DESC);
CREATE INDEX idx_sync_sessions_device ON sync_sessions (device_id, started_at DESC);

CREATE TABLE submissions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL REFERENCES tenants(id),
    form_template_version_id UUID NOT NULL REFERENCES form_template_versions(id),
    client_uuid              UUID NOT NULL,
    sync_session_id          UUID REFERENCES sync_sessions(id),
    submitted_by             UUID NOT NULL REFERENCES users(id),
    device_id                VARCHAR(80),
    captured_at              TIMESTAMPTZ NOT NULL,
    received_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    capture_location         GEOGRAPHY(Point, 4326),
    capture_accuracy_metres  NUMERIC(8,2),
    content_fingerprint      VARCHAR(64),
    status                   submission_status NOT NULL DEFAULT 'received',
    rejection_reasons        JSONB,
    beneficiary_id           UUID,
    household_id             UUID,
    programme_activity_id    UUID,
    grant_activity_id        UUID,
    superseded_by_id         UUID REFERENCES submissions(id),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version                  INTEGER NOT NULL DEFAULT 1,
    is_deleted               BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT submissions_client_uuid_unique UNIQUE (tenant_id, client_uuid),
    CONSTRAINT submissions_captured_not_future CHECK (captured_at <= NOW() + INTERVAL '1 day'),
    CONSTRAINT submissions_received_after_capture CHECK (received_at >= captured_at - INTERVAL '1 day')
);

CREATE INDEX idx_submissions_tenant_status ON submissions (tenant_id, status)
    WHERE NOT is_deleted;
CREATE INDEX idx_submissions_form_version ON submissions (form_template_version_id, captured_at DESC);
CREATE INDEX idx_submissions_user ON submissions (submitted_by, captured_at DESC);
CREATE INDEX idx_submissions_fingerprint ON submissions (tenant_id, content_fingerprint)
    WHERE content_fingerprint IS NOT NULL;
CREATE INDEX idx_submissions_beneficiary ON submissions (beneficiary_id)
    WHERE beneficiary_id IS NOT NULL;
CREATE INDEX idx_submissions_grant_activity ON submissions (grant_activity_id)
    WHERE grant_activity_id IS NOT NULL;
CREATE INDEX idx_submissions_location ON submissions USING GIST (capture_location);

CREATE TABLE submission_values (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    submission_id  UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    form_field_id  UUID NOT NULL REFERENCES form_fields(id),
    field_key      VARCHAR(80) NOT NULL,
    value_text     TEXT,
    value_number   NUMERIC(20,6),
    value_date     DATE,
    value_datetime TIMESTAMPTZ,
    value_boolean  BOOLEAN,
    value_location GEOGRAPHY(Point, 4326),
    value_encrypted BYTEA,
    value_json     JSONB,

    CONSTRAINT submission_value_unique UNIQUE (submission_id, form_field_id)
);

CREATE INDEX idx_submission_values_submission ON submission_values (submission_id);
CREATE INDEX idx_submission_values_field_number ON submission_values (form_field_id, value_number)
    WHERE value_number IS NOT NULL;

CREATE TABLE submission_attachments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    form_field_id UUID REFERENCES form_fields(id),
    file_id       UUID NOT NULL,
    attachment_type VARCHAR(20) NOT NULL,
    upload_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT attachment_type_valid CHECK (attachment_type IN ('photo','signature','audio','document'))
);

CREATE TABLE submission_review_queue (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    submission_id  UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    reason         VARCHAR(40) NOT NULL,
    candidate_matches JSONB,
    priority       SMALLINT NOT NULL DEFAULT 5,
    assigned_to    UUID REFERENCES users(id),
    resolved_at    TIMESTAMPTZ,
    resolution     VARCHAR(30),
    resolved_by    UUID REFERENCES users(id),
    resolution_notes TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT review_reason_valid CHECK (reason IN
        ('probable_duplicate','validation_warning','gps_out_of_bounds',
         'late_submission','anomalous_value','manual_flag')),
    CONSTRAINT review_resolution_valid CHECK (resolution IS NULL OR resolution IN
        ('accepted','rejected','merged','superseded'))
);

CREATE INDEX idx_review_queue_open ON submission_review_queue (tenant_id, priority DESC, created_at)
    WHERE resolved_at IS NULL;
```

---

## 8.7 Schema: Learning

```sql
CREATE TABLE courses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id),
    code         VARCHAR(40) NOT NULL,
    title        VARCHAR(300) NOT NULL,
    category     VARCHAR(60),
    is_mandatory_default BOOLEAN NOT NULL DEFAULT FALSE,
    current_version_id UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version      INTEGER NOT NULL DEFAULT 1,
    is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT courses_code_unique UNIQUE (tenant_id, code)
);

CREATE TABLE course_versions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id),
    course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    version_number    INTEGER NOT NULL,
    title             VARCHAR(300) NOT NULL,
    description       TEXT,
    pass_threshold_percent SMALLINT NOT NULL DEFAULT 80,
    estimated_minutes INTEGER,
    max_attempts      SMALLINT,
    validity_months   SMALLINT,
    language          VARCHAR(10) NOT NULL DEFAULT 'en-GB',
    scorm_package_ref VARCHAR(300),
    is_published      BOOLEAN NOT NULL DEFAULT FALSE,
    published_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT course_version_unique UNIQUE (course_id, version_number),
    CONSTRAINT pass_threshold_valid CHECK (pass_threshold_percent BETWEEN 1 AND 100)
);

CREATE TABLE modules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id),
    course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
    title             VARCHAR(300) NOT NULL,
    display_order     SMALLINT NOT NULL,
    is_required       BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT module_order_unique UNIQUE (course_version_id, display_order)
);

CREATE TABLE lessons (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    module_id     UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title         VARCHAR(300) NOT NULL,
    content_type  VARCHAR(20) NOT NULL,
    content_body  TEXT,
    content_file_id UUID,
    duration_minutes SMALLINT,
    display_order SMALLINT NOT NULL,

    CONSTRAINT lesson_content_type_valid CHECK (content_type IN
        ('text','video','pdf','slides','scorm','external_link')),
    CONSTRAINT lesson_order_unique UNIQUE (module_id, display_order)
);

CREATE TABLE assessments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    module_id     UUID REFERENCES modules(id) ON DELETE CASCADE,
    course_version_id UUID REFERENCES course_versions(id) ON DELETE CASCADE,
    title         VARCHAR(300) NOT NULL,
    pass_threshold_percent SMALLINT NOT NULL DEFAULT 80,
    time_limit_minutes SMALLINT,
    shuffle_questions BOOLEAN NOT NULL DEFAULT TRUE,
    max_attempts  SMALLINT NOT NULL DEFAULT 3,
    cooldown_hours SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT assessment_scope CHECK
        ((module_id IS NOT NULL) <> (course_version_id IS NOT NULL))
);

CREATE TABLE questions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL,
    points        SMALLINT NOT NULL DEFAULT 1,
    explanation   TEXT,
    display_order SMALLINT NOT NULL,

    CONSTRAINT question_type_valid CHECK (question_type IN
        ('single_choice','multiple_choice','true_false','short_answer'))
);

CREATE TABLE answer_options (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    question_id   UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text   TEXT NOT NULL,
    is_correct    BOOLEAN NOT NULL DEFAULT FALSE,
    display_order SMALLINT NOT NULL
);

CREATE TABLE mandatory_training_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    course_id           UUID NOT NULL REFERENCES courses(id),
    applies_to_type     VARCHAR(30) NOT NULL,
    applies_to_id       UUID,
    applies_to_value    VARCHAR(60),
    due_days_after_hire SMALLINT NOT NULL DEFAULT 30,
    recurrence_months   SMALLINT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mandatory_applies_valid CHECK (applies_to_type IN
        ('all_staff','department','position','employment_type','duty_station'))
);

CREATE TABLE lms_enrollments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id),
    employee_id       UUID NOT NULL,
    user_id           UUID REFERENCES users(id),
    course_version_id UUID NOT NULL REFERENCES course_versions(id),
    source            enrollment_source NOT NULL,
    mandatory_rule_id UUID REFERENCES mandatory_training_rules(id),
    is_mandatory      BOOLEAN NOT NULL DEFAULT FALSE,
    status            enrollment_status NOT NULL DEFAULT 'assigned',
    due_date          DATE,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    final_score       NUMERIC(5,2),
    attempts_used     SMALLINT NOT NULL DEFAULT 0,
    reminder_count    SMALLINT NOT NULL DEFAULT 0,
    escalated_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version           INTEGER NOT NULL DEFAULT 1,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT lms_enrollment_unique UNIQUE (employee_id, course_version_id),
    CONSTRAINT lms_completion_consistent CHECK
        ((status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed'),
    CONSTRAINT lms_score_range CHECK (final_score IS NULL OR final_score BETWEEN 0 AND 100)
);

CREATE INDEX idx_lms_enrollments_employee ON lms_enrollments (employee_id, status);
CREATE INDEX idx_lms_enrollments_overdue ON lms_enrollments (tenant_id, due_date)
    WHERE is_mandatory AND status IN ('assigned','in_progress') AND NOT is_deleted;

CREATE TABLE lesson_progress (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    enrollment_id  UUID NOT NULL REFERENCES lms_enrollments(id) ON DELETE CASCADE,
    lesson_id      UUID NOT NULL REFERENCES lessons(id),
    completed_at   TIMESTAMPTZ,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    last_position  VARCHAR(100),

    CONSTRAINT lesson_progress_unique UNIQUE (enrollment_id, lesson_id)
);

CREATE TABLE assessment_attempts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    enrollment_id  UUID NOT NULL REFERENCES lms_enrollments(id) ON DELETE CASCADE,
    assessment_id  UUID NOT NULL REFERENCES assessments(id),
    attempt_number SMALLINT NOT NULL,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at   TIMESTAMPTZ,
    score_percent  NUMERIC(5,2),
    passed         BOOLEAN,
    responses      JSONB,

    CONSTRAINT attempt_unique UNIQUE (enrollment_id, assessment_id, attempt_number)
);

CREATE TABLE certificates (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES tenants(id),
    enrollment_id      UUID NOT NULL REFERENCES lms_enrollments(id) ON DELETE RESTRICT,
    employee_id        UUID NOT NULL,
    certificate_number VARCHAR(50) NOT NULL,
    course_title       VARCHAR(300) NOT NULL,
    course_version_number INTEGER NOT NULL,
    issued_date        DATE NOT NULL,
    expires_date       DATE,
    file_id            UUID,
    verification_hash  VARCHAR(64) NOT NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT certificate_number_unique UNIQUE (tenant_id, certificate_number),
    CONSTRAINT certificate_expiry_valid CHECK (expires_date IS NULL OR expires_date > issued_date)
);
```

`certificates.verification_hash` lets an external party verify a certificate against a public endpoint without the platform disclosing anything else about the employee.

---

## 8.8 Schema: Platform

```sql
CREATE TABLE outbox_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL,
    event_type     VARCHAR(100) NOT NULL,
    schema_version SMALLINT NOT NULL DEFAULT 1,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id   UUID NOT NULL,
    payload        JSONB NOT NULL,
    metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
    correlation_id VARCHAR(64) NOT NULL,
    causation_id   VARCHAR(64),
    actor_user_id  UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at   TIMESTAMPTZ,
    publish_attempts SMALLINT NOT NULL DEFAULT 0,
    last_error     TEXT
);

-- Partial index over unpublished rows only. The table is large;
-- the working set the relay polls is tiny.
CREATE INDEX idx_outbox_unpublished ON outbox_events (created_at)
    WHERE published_at IS NULL;
CREATE INDEX idx_outbox_aggregate ON outbox_events (aggregate_type, aggregate_id, created_at DESC);

CREATE TABLE audit_events (
    id             UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id  UUID,
    actor_email    VARCHAR(255),
    actor_role     VARCHAR(50),
    actor_type     VARCHAR(20) NOT NULL DEFAULT 'user',
    action         VARCHAR(80) NOT NULL,
    resource_type  VARCHAR(60) NOT NULL,
    resource_id    UUID,
    resource_label VARCHAR(200),
    before_state   JSONB,
    after_state    JSONB,
    changed_fields TEXT[],
    purpose        VARCHAR(80),
    outcome        VARCHAR(20) NOT NULL DEFAULT 'success',
    ip_address     INET,
    user_agent     TEXT,
    correlation_id VARCHAR(64),
    service_name   VARCHAR(50) NOT NULL,
    previous_hash  VARCHAR(64),
    record_hash    VARCHAR(64) NOT NULL,

    PRIMARY KEY (id, occurred_at),
    CONSTRAINT audit_actor_type_valid CHECK (actor_type IN ('user','service','system','anonymous')),
    CONSTRAINT audit_outcome_valid CHECK (outcome IN ('success','failure','denied'))
) PARTITION BY RANGE (occurred_at);

CREATE INDEX idx_audit_tenant_time ON audit_events (tenant_id, occurred_at DESC);
CREATE INDEX idx_audit_resource ON audit_events (resource_type, resource_id, occurred_at DESC);
CREATE INDEX idx_audit_actor ON audit_events (actor_user_id, occurred_at DESC);
CREATE INDEX idx_audit_correlation ON audit_events (correlation_id);
CREATE INDEX idx_audit_pii_access ON audit_events (tenant_id, occurred_at DESC)
    WHERE purpose IS NOT NULL;

CREATE TRIGGER audit_events_immutable
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TABLE file_objects (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES tenants(id),
    storage_bucket     VARCHAR(100) NOT NULL,
    storage_key        VARCHAR(500) NOT NULL,
    original_filename  VARCHAR(300) NOT NULL,
    content_type       VARCHAR(150) NOT NULL,
    detected_content_type VARCHAR(150),
    size_bytes         BIGINT NOT NULL,
    checksum_sha256    VARCHAR(64),
    purpose            VARCHAR(50) NOT NULL,
    owner_resource_type VARCHAR(60),
    owner_resource_id  UUID,
    contains_pii       BOOLEAN NOT NULL DEFAULT FALSE,
    scan_status        scan_status NOT NULL DEFAULT 'pending',
    scanned_at         TIMESTAMPTZ,
    exif_stripped      BOOLEAN NOT NULL DEFAULT FALSE,
    uploaded_by        UUID REFERENCES users(id),
    upload_completed_at TIMESTAMPTZ,
    retention_until    DATE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version            INTEGER NOT NULL DEFAULT 1,
    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT file_storage_key_unique UNIQUE (storage_bucket, storage_key),
    CONSTRAINT file_size_positive CHECK (size_bytes > 0),
    CONSTRAINT file_size_limit CHECK (size_bytes <= 104857600)
);

CREATE INDEX idx_files_owner ON file_objects (owner_resource_type, owner_resource_id);
CREATE INDEX idx_files_pending_scan ON file_objects (created_at)
    WHERE scan_status = 'pending';
CREATE INDEX idx_files_retention ON file_objects (retention_until)
    WHERE retention_until IS NOT NULL AND NOT is_deleted;

CREATE TABLE notification_templates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID REFERENCES tenants(id),
    code          VARCHAR(80) NOT NULL,
    channel       notification_channel NOT NULL,
    locale        VARCHAR(10) NOT NULL DEFAULT 'en-GB',
    subject       VARCHAR(300),
    body_template TEXT NOT NULL,
    category      VARCHAR(40) NOT NULL,
    is_critical   BOOLEAN NOT NULL DEFAULT FALSE,
    allows_pii    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version       INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT notification_template_unique UNIQUE (tenant_id, code, channel, locale),
    CONSTRAINT sms_never_allows_pii CHECK (NOT (channel = 'sms' AND allows_pii))
);

CREATE TABLE notification_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    template_code   VARCHAR(80) NOT NULL,
    channel         notification_channel NOT NULL,
    recipient_user_id UUID REFERENCES users(id),
    recipient_address VARCHAR(255) NOT NULL,
    dedupe_key      VARCHAR(120),
    subject         VARCHAR(300),
    status          delivery_status NOT NULL DEFAULT 'queued',
    attempts        SMALLINT NOT NULL DEFAULT 0,
    provider_message_id VARCHAR(200),
    provider_response JSONB,
    triggered_by_event VARCHAR(100),
    correlation_id  VARCHAR(64),
    queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    failed_at       TIMESTAMPTZ,
    failure_reason  TEXT,

    CONSTRAINT notification_dedupe_unique UNIQUE (tenant_id, dedupe_key)
);

CREATE INDEX idx_notifications_recipient ON notification_deliveries
    (recipient_user_id, queued_at DESC);
CREATE INDEX idx_notifications_failed ON notification_deliveries (tenant_id, failed_at DESC)
    WHERE status = 'failed';

CREATE TABLE idempotency_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    user_id         UUID,
    request_method  VARCHAR(10) NOT NULL,
    request_path    VARCHAR(300) NOT NULL,
    request_body_hash VARCHAR(64) NOT NULL,
    response_status SMALLINT,
    response_body   JSONB,
    state           VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',

    CONSTRAINT idempotency_key_unique UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT idempotency_state_valid CHECK (state IN ('in_progress','completed','failed'))
);

CREATE INDEX idx_idempotency_expiry ON idempotency_keys (expires_at);

CREATE TABLE ai_generations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id),
    use_case         VARCHAR(50) NOT NULL,
    model_identifier VARCHAR(80) NOT NULL,
    prompt_template_version VARCHAR(20) NOT NULL,
    prompt_hash      VARCHAR(64) NOT NULL,
    prompt_stored    TEXT,
    response_text    TEXT,
    input_tokens     INTEGER,
    output_tokens    INTEGER,
    latency_ms       INTEGER,
    redaction_passed BOOLEAN NOT NULL,
    guardrail_results JSONB,
    approval_status  VARCHAR(20) NOT NULL DEFAULT 'unapproved',
    approved_by      UUID REFERENCES users(id),
    approved_at      TIMESTAMPTZ,
    edited_before_use BOOLEAN,
    requested_by     UUID NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ai_approval_valid CHECK (approval_status IN
        ('unapproved','approved','rejected','discarded')),
    CONSTRAINT ai_approved_has_approver CHECK
        (approval_status <> 'approved' OR approved_by IS NOT NULL)
);

CREATE INDEX idx_ai_generations_tenant ON ai_generations (tenant_id, created_at DESC);
CREATE INDEX idx_ai_pending_review ON ai_generations (tenant_id)
    WHERE approval_status = 'unapproved';
```

---

## 8.9 Views

```sql
-- Burn rate: the single most requested figure in the platform.
-- Materialised because it is read constantly and changes slowly.
CREATE MATERIALIZED VIEW mv_grant_burn_rate AS
SELECT
    g.id AS grant_id,
    g.tenant_id,
    g.grant_number,
    g.title,
    g.currency,
    g.total_amount,
    g.received_to_date,
    g.expenditure_to_date,
    CASE WHEN g.total_amount > 0
         THEN ROUND(g.expenditure_to_date / g.total_amount * 100, 2)
         ELSE 0 END AS spend_percent,
    GREATEST(0, LEAST(100, ROUND(
        (CURRENT_DATE - g.start_date)::numeric
        / NULLIF((g.end_date - g.start_date), 0) * 100, 2))) AS time_elapsed_percent,
    CASE WHEN g.total_amount > 0 AND g.end_date > g.start_date
         THEN ROUND(
             (g.expenditure_to_date / g.total_amount * 100)
             - LEAST(100, (CURRENT_DATE - g.start_date)::numeric
                    / NULLIF((g.end_date - g.start_date), 0) * 100), 2)
         ELSE NULL END AS burn_variance_points,
    (g.end_date - CURRENT_DATE) AS days_remaining,
    NOW() AS computed_at
FROM grants g
WHERE g.status = 'active' AND NOT g.is_deleted;

CREATE UNIQUE INDEX idx_mv_burn_rate_grant ON mv_grant_burn_rate (grant_id);
CREATE INDEX idx_mv_burn_rate_tenant ON mv_grant_burn_rate (tenant_id);

-- Refreshed every 15 minutes concurrently, so readers are never blocked.
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_grant_burn_rate;

-- Mandatory training compliance, the answer to the most common audit question.
CREATE VIEW v_training_compliance AS
SELECT
    e.tenant_id,
    e.id AS employee_id,
    e.employee_number,
    e.display_name,
    e.department_id,
    COUNT(le.id) FILTER (WHERE le.is_mandatory) AS mandatory_assigned,
    COUNT(le.id) FILTER (WHERE le.is_mandatory AND le.status = 'completed') AS mandatory_completed,
    COUNT(le.id) FILTER (WHERE le.is_mandatory AND le.status IN ('assigned','in_progress')
                          AND le.due_date < CURRENT_DATE) AS mandatory_overdue,
    CASE WHEN COUNT(le.id) FILTER (WHERE le.is_mandatory) = 0 THEN 100
         ELSE ROUND(COUNT(le.id) FILTER (WHERE le.is_mandatory AND le.status = 'completed')::numeric
              / COUNT(le.id) FILTER (WHERE le.is_mandatory) * 100, 1)
    END AS compliance_percent
FROM employees e
LEFT JOIN lms_enrollments le ON le.employee_id = e.id AND NOT le.is_deleted
WHERE e.status = 'active' AND NOT e.is_deleted
GROUP BY e.tenant_id, e.id, e.employee_number, e.display_name, e.department_id;

-- Beneficiary reach with k-anonymity suppression applied at the view level,
-- so a reporting bug cannot expose a small cohort.
CREATE VIEW v_programme_reach AS
SELECT
    p.tenant_id,
    p.id AS programme_id,
    p.name,
    p.sector,
    p.location_admin1,
    CASE WHEN COUNT(DISTINCT pe.beneficiary_id) < 5 THEN NULL
         ELSE COUNT(DISTINCT pe.beneficiary_id) END AS beneficiaries_reached,
    CASE WHEN COUNT(DISTINCT pe.beneficiary_id) < 5 THEN NULL
         ELSE COUNT(DISTINCT pe.household_id) END AS households_reached,
    CASE WHEN COUNT(DISTINCT pe.beneficiary_id) < 5 THEN TRUE ELSE FALSE END AS is_suppressed
FROM programmes p
LEFT JOIN programme_enrollments pe
       ON pe.programme_id = p.id AND pe.status = 'active' AND NOT pe.is_deleted
WHERE NOT p.is_deleted
GROUP BY p.tenant_id, p.id, p.name, p.sector, p.location_admin1;
```

---

## 8.10 Database roles and grants

Least privilege at the database layer, so an application compromise does not become a database compromise.

```sql
-- One role per service. No service can read another service's tables.
CREATE ROLE svc_grant       LOGIN;
CREATE ROLE svc_hr_payroll  LOGIN;
CREATE ROLE svc_beneficiary LOGIN;
CREATE ROLE svc_field_data  LOGIN;
CREATE ROLE svc_lms         LOGIN;
CREATE ROLE svc_auth        LOGIN;
CREATE ROLE svc_tenant      LOGIN;
CREATE ROLE svc_audit       LOGIN;
CREATE ROLE svc_file        LOGIN;
CREATE ROLE svc_notification LOGIN;
CREATE ROLE svc_reporting   LOGIN;
CREATE ROLE svc_integration LOGIN;
CREATE ROLE svc_analytics   LOGIN;
CREATE ROLE svc_ai          LOGIN;

-- Migration role is separate and is not used by any running service.
CREATE ROLE migrator LOGIN;

-- Read-only analytics role, restricted to the read replica.
CREATE ROLE analytics_reader LOGIN;

-- Example grants: grant-service owns its tables and may read nothing else.
GRANT SELECT, INSERT, UPDATE ON
    donors, grants, grant_budgets, budget_lines, disbursements,
    grant_report_periods, grant_reports, grant_activities,
    grant_compliance_snapshots, expenditures, outbox_events
    TO svc_grant;

-- No DELETE anywhere. Soft delete only.
-- No grant on beneficiaries, employees or payroll tables.

-- audit-service can insert and read, never modify.
GRANT SELECT, INSERT ON audit_events TO svc_audit;
REVOKE UPDATE, DELETE ON audit_events FROM svc_audit;

-- Services do not bypass RLS.
ALTER ROLE svc_grant       NOBYPASSRLS;
ALTER ROLE svc_hr_payroll  NOBYPASSRLS;
ALTER ROLE svc_beneficiary NOBYPASSRLS;
ALTER ROLE svc_field_data  NOBYPASSRLS;
ALTER ROLE svc_lms         NOBYPASSRLS;
ALTER ROLE svc_audit       NOBYPASSRLS;

-- Payroll schema access is granted per tenant at provisioning time.
-- GRANT USAGE ON SCHEMA tenant_<slug> TO svc_hr_payroll;
```

Statement and idle-transaction timeouts are set per role so a runaway query cannot hold locks indefinitely:

```sql
ALTER ROLE svc_grant SET statement_timeout = '10s';
ALTER ROLE svc_grant SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE svc_reporting SET statement_timeout = '120s';   -- report generation
ALTER ROLE analytics_reader SET statement_timeout = '300s'; -- replica only
```

---

## 8.11 Schema verification

The following checks run after every migration in every environment. A failure blocks the deployment.

| Check | Failure means |
| --- | --- |
| Every table with a `tenant_id` has RLS enabled and forced | A tenant isolation hole |
| Every table with a `tenant_id` has a `tenant_isolation` policy | Same |
| Every foreign key has a supporting index | A future lock and performance problem |
| No column of type `money`, `float4` or `float8` in a monetary context | Financial precision defect |
| No `TIMESTAMP WITHOUT TIME ZONE` | Timezone defect |
| Every table has `created_at` and `updated_at` | Debuggability |
| Every tenant table has the `update_updated_at_column` trigger | Stale timestamps |
| No service role holds `DELETE` on a tenant data table | Soft-delete violation |
| No service role has `BYPASSRLS` | Isolation violation |
| Every new column is present in the data dictionary with a classification | Undocumented data, likely undocumented PII |

The last check is enforced by comparing `information_schema.columns` against [Appendix B](appendices/b-data-dictionary.md), which makes the data dictionary a build artefact rather than documentation that drifts.
