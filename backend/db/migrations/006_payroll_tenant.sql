-- 006_payroll_tenant.sql — leave tables + per-tenant payroll schema (ADR-0006)

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payroll_schema text;

CREATE TABLE IF NOT EXISTS leave_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            VARCHAR(30) NOT NULL,
  name            VARCHAR(100) NOT NULL,
  accrual_days    NUMERIC(6,2) NOT NULL DEFAULT 0,
  is_paid         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_types_unique UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  employee_id     UUID NOT NULL REFERENCES employees(id),
  leave_type_id   UUID NOT NULL REFERENCES leave_types(id),
  accrued_days    NUMERIC(6,2) NOT NULL DEFAULT 0,
  taken_days      NUMERIC(6,2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_balances_unique UNIQUE (tenant_id, employee_id, leave_type_id)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  employee_id     UUID NOT NULL REFERENCES employees(id),
  leave_type_id   UUID NOT NULL REFERENCES leave_types(id),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  days_requested  NUMERIC(6,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  approver_id     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_status_valid CHECK (status IN ('pending','approved','rejected','cancelled')),
  CONSTRAINT leave_requests_period_valid CHECK (end_date >= start_date)
);

ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types FORCE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leave_types_tenant_isolation ON leave_types;
CREATE POLICY leave_types_tenant_isolation ON leave_types
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS leave_balances_tenant_isolation ON leave_balances;
CREATE POLICY leave_balances_tenant_isolation ON leave_balances
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS leave_requests_tenant_isolation ON leave_requests;
CREATE POLICY leave_requests_tenant_isolation ON leave_requests
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON leave_types, leave_balances, leave_requests TO ngois_app;

-- Provision tenant_<slug> payroll tables (runs per tenant during seed / RB-05)
CREATE OR REPLACE FUNCTION ngois_payroll_schema_name(p_slug text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT 'tenant_' || replace(replace(lower(p_slug), '-', '_'), ' ', '_')
$$;

CREATE OR REPLACE FUNCTION provision_tenant_payroll_schema(p_tenant_id uuid, p_slug text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  schema_name text := ngois_payroll_schema_name(p_slug);
BEGIN
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.payroll_runs (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      period_year         INTEGER NOT NULL,
      period_month        INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
      status              payroll_status NOT NULL DEFAULT 'draft',
      ruleset_hash        TEXT,
      fx_rate_set         JSONB NOT NULL DEFAULT '{}'::jsonb,
      prepared_by         UUID,
      submitted_by        UUID,
      approved_by         UUID,
      total_gross         NUMERIC(15,2) NOT NULL DEFAULT 0,
      total_deductions    NUMERIC(15,2) NOT NULL DEFAULT 0,
      total_net           NUMERIC(15,2) NOT NULL DEFAULT 0,
      total_employer_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
      failure_reason      TEXT,
      reversal_of         UUID,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT payroll_runs_approver_differs CHECK (
        approved_by IS NULL OR submitted_by IS NULL OR approved_by <> submitted_by
      ),
      CONSTRAINT payroll_runs_period_unique UNIQUE (period_year, period_month)
    )
  $sql$, schema_name);

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.payroll_records (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payroll_run_id      UUID NOT NULL REFERENCES %I.payroll_runs(id) ON DELETE CASCADE,
      employee_id         UUID NOT NULL,
      gross               NUMERIC(15,2) NOT NULL,
      total_deductions    NUMERIC(15,2) NOT NULL,
      net                 NUMERIC(15,2) NOT NULL,
      employer_cost       NUMERIC(15,2) NOT NULL,
      currency            CHAR(3) NOT NULL,
      compute_status      VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT payroll_records_run_employee UNIQUE (payroll_run_id, employee_id)
    )
  $sql$, schema_name, schema_name);

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.payroll_record_lines (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payroll_record_id   UUID NOT NULL REFERENCES %I.payroll_records(id) ON DELETE CASCADE,
      line_order          SMALLINT NOT NULL,
      component_code      VARCHAR(40) NOT NULL,
      basis_amount        NUMERIC(15,2) NOT NULL,
      rate_applied        NUMERIC(8,3),
      amount              NUMERIC(15,2) NOT NULL,
      source_reference    VARCHAR(300)
    )
  $sql$, schema_name, schema_name);

  EXECUTE format('GRANT USAGE ON SCHEMA %I TO svc_hr_payroll', schema_name);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO svc_hr_payroll', schema_name);

  UPDATE tenants SET payroll_schema = schema_name WHERE id = p_tenant_id;
  RETURN schema_name;
END;
$$;

GRANT EXECUTE ON FUNCTION provision_tenant_payroll_schema(uuid, text) TO ngois;
