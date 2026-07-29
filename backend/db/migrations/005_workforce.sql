-- 005_workforce.sql — Phase 2 HR core (shared schema) + statutory reference data

CREATE TYPE emp_status AS ENUM ('pending', 'active', 'on_leave', 'suspended', 'terminated');
CREATE TYPE contract_status AS ENUM ('draft', 'active', 'expiring', 'expired', 'terminated');
CREATE TYPE payroll_status AS ENUM (
  'draft', 'computing', 'computed', 'pending_approval', 'approved', 'disbursed', 'reversed', 'failed'
);

CREATE TABLE IF NOT EXISTS departments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  parent_id     UUID REFERENCES departments(id),
  code          VARCHAR(30) NOT NULL,
  name          VARCHAR(200) NOT NULL,
  cost_centre   VARCHAR(50),
  manager_employee_id UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  version       INTEGER NOT NULL DEFAULT 1,
  is_deleted    BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT departments_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT departments_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE IF NOT EXISTS positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  department_id   UUID NOT NULL REFERENCES departments(id),
  title           VARCHAR(200) NOT NULL,
  grade           VARCHAR(20),
  reports_to_position_id UUID REFERENCES positions(id),
  is_supervisory  BOOLEAN NOT NULL DEFAULT false,
  headcount_budgeted SMALLINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  version         INTEGER NOT NULL DEFAULT 1,
  is_deleted      BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS employees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id             UUID REFERENCES users(id),
  employee_number     VARCHAR(30) NOT NULL,
  first_name_encrypted BYTEA NOT NULL,
  last_name_encrypted  BYTEA NOT NULL,
  display_name        VARCHAR(200) NOT NULL,
  name_blind_index    VARCHAR(64) NOT NULL,
  payroll_country     CHAR(2) NOT NULL,
  employment_type     VARCHAR(30) NOT NULL DEFAULT 'national_staff',
  status              emp_status NOT NULL DEFAULT 'pending',
  hire_date           DATE NOT NULL,
  termination_date    DATE,
  department_id       UUID NOT NULL REFERENCES departments(id),
  position_id         UUID REFERENCES positions(id),
  line_manager_id     UUID REFERENCES employees(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  version             INTEGER NOT NULL DEFAULT 1,
  is_deleted          BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT employees_number_per_tenant UNIQUE (tenant_id, employee_number),
  CONSTRAINT employees_user_unique UNIQUE (user_id),
  CONSTRAINT employees_type_valid CHECK (employment_type IN
    ('national_staff','international','volunteer','consultant','intern','seconded')),
  CONSTRAINT employees_no_self_manager CHECK (line_manager_id IS NULL OR line_manager_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_employees_tenant_status ON employees (tenant_id, status) WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  contract_number   VARCHAR(50) NOT NULL,
  contract_type     VARCHAR(40) NOT NULL DEFAULT 'fixed_term',
  start_date        DATE NOT NULL,
  end_date          DATE,
  gross_salary      NUMERIC(15,2) NOT NULL,
  salary_currency   CHAR(3) NOT NULL,
  payment_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  allowances        JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            contract_status NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  version           INTEGER NOT NULL DEFAULT 1,
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT contracts_number_unique UNIQUE (tenant_id, contract_number),
  CONSTRAINT contracts_period_valid CHECK (end_date IS NULL OR end_date > start_date),
  CONSTRAINT contracts_salary_positive CHECK (gross_salary > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_one_active
  ON contracts (employee_id)
  WHERE status = 'active' AND NOT is_deleted;

CREATE TABLE IF NOT EXISTS tax_bands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code    CHAR(2) NOT NULL,
  tax_type        VARCHAR(20) NOT NULL DEFAULT 'PAYE',
  band_order      SMALLINT NOT NULL,
  lower_bound     NUMERIC(15,2) NOT NULL DEFAULT 0,
  upper_bound     NUMERIC(15,2),
  rate_percent    NUMERIC(6,3) NOT NULL,
  fixed_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency        CHAR(3) NOT NULL,
  period_basis    VARCHAR(20) NOT NULL DEFAULT 'monthly',
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  legal_reference VARCHAR(300),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tax_bands_unique UNIQUE (country_code, tax_type, band_order, effective_from),
  CONSTRAINT tax_bands_rate_valid CHECK (rate_percent BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_tax_bands_lookup ON tax_bands
  (country_code, tax_type, effective_from DESC, band_order);

CREATE TABLE IF NOT EXISTS statutory_contribution_rates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code          CHAR(2) NOT NULL,
  scheme_code           VARCHAR(20) NOT NULL,
  scheme_name           VARCHAR(100) NOT NULL,
  employee_rate_percent NUMERIC(6,3) NOT NULL,
  employer_rate_percent NUMERIC(6,3) NOT NULL,
  contribution_base     VARCHAR(30) NOT NULL DEFAULT 'gross',
  deductible_before_tax BOOLEAN NOT NULL DEFAULT false,
  currency              CHAR(3) NOT NULL,
  effective_from        DATE NOT NULL,
  effective_to          DATE,
  legal_reference       VARCHAR(300),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contribution_rates_unique UNIQUE (country_code, scheme_code, effective_from)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency  CHAR(3) NOT NULL,
  quote_currency CHAR(3) NOT NULL,
  rate           NUMERIC(18,8) NOT NULL,
  rate_source    VARCHAR(80) NOT NULL,
  rate_date      DATE NOT NULL,
  is_official    BOOLEAN NOT NULL DEFAULT true,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fx_rate_unique UNIQUE (base_currency, quote_currency, rate_date, rate_source),
  CONSTRAINT fx_rate_positive CHECK (rate > 0)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup ON fx_rates
  (base_currency, quote_currency, rate_date DESC) WHERE is_official;

-- Per-tenant payroll schema role (ADR-0006)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'svc_hr_payroll') THEN
    CREATE ROLE svc_hr_payroll NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO svc_hr_payroll;
GRANT SELECT ON tax_bands, statutory_contribution_rates, fx_rates TO svc_hr_payroll;
GRANT SELECT ON tenants TO svc_hr_payroll;

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions FORCE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_tenant_isolation ON departments;
CREATE POLICY departments_tenant_isolation ON departments
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS positions_tenant_isolation ON positions;
CREATE POLICY positions_tenant_isolation ON positions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS employees_tenant_isolation ON employees;
CREATE POLICY employees_tenant_isolation ON employees
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS contracts_tenant_isolation ON contracts;
CREATE POLICY contracts_tenant_isolation ON contracts
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON departments, positions, employees, contracts TO ngois_app;
GRANT svc_hr_payroll TO ngois_app;

-- Seed illustrative statutory rules (Appendix I — verified by accountant before prod)
INSERT INTO tax_bands (country_code, tax_type, band_order, lower_bound, upper_bound, rate_percent, currency, effective_from, legal_reference)
VALUES
  ('SS', 'PAYE', 1, 0, 3000, 0, 'SSP', '2026-01-01', 'Illustrative SS PAYE band 1'),
  ('SS', 'PAYE', 2, 3000, 5000, 10, 'SSP', '2026-01-01', 'Illustrative SS PAYE band 2'),
  ('SS', 'PAYE', 3, 5000, 10000, 15, 'SSP', '2026-01-01', 'Illustrative SS PAYE band 3'),
  ('SS', 'PAYE', 4, 10000, NULL, 20, 'SSP', '2026-01-01', 'Illustrative SS PAYE band 4'),
  ('UG', 'PAYE', 1, 0, 235000, 0, 'UGX', '2026-01-01', 'Illustrative UG PAYE band 1'),
  ('UG', 'PAYE', 2, 235000, 335000, 10, 'UGX', '2026-01-01', 'Illustrative UG PAYE band 2'),
  ('UG', 'PAYE', 3, 335000, 410000, 20, 'UGX', '2026-01-01', 'Illustrative UG PAYE band 3'),
  ('UG', 'PAYE', 4, 410000, 10000000, 30, 'UGX', '2026-01-01', 'Illustrative UG PAYE band 4'),
  ('UG', 'PAYE', 5, 10000000, NULL, 40, 'UGX', '2026-01-01', 'Illustrative UG PAYE band 5')
ON CONFLICT DO NOTHING;

INSERT INTO statutory_contribution_rates (
  country_code, scheme_code, scheme_name,
  employee_rate_percent, employer_rate_percent, contribution_base,
  deductible_before_tax, currency, effective_from, legal_reference
)
VALUES
  ('SS', 'NSIF', 'National Social Insurance Fund', 8, 17, 'pensionable', true, 'SSP', '2026-01-01', 'Illustrative NSIF'),
  ('UG', 'NSSF', 'National Social Security Fund', 5, 10, 'gross', false, 'UGX', '2026-01-01', 'Illustrative NSSF')
ON CONFLICT DO NOTHING;

INSERT INTO fx_rates (base_currency, quote_currency, rate, rate_source, rate_date)
VALUES
  ('USD', 'SSP', 6000.00000000, 'seed', CURRENT_DATE),
  ('USD', 'UGX', 3800.00000000, 'seed', CURRENT_DATE)
ON CONFLICT DO NOTHING;
