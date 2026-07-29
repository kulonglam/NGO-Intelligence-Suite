-- Per-tenant payroll schema template (ADR-0006). Placeholders: {{SCHEMA}}, {{TENANT_ID}}

CREATE SCHEMA IF NOT EXISTS {{SCHEMA}};

CREATE TABLE IF NOT EXISTS {{SCHEMA}}.payroll_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  run_reference         VARCHAR(50) NOT NULL,
  country_code          CHAR(2) NOT NULL,
  pay_period_start      DATE NOT NULL,
  pay_period_end        DATE NOT NULL,
  payment_date          DATE,
  status                payroll_status NOT NULL DEFAULT 'draft',
  employee_count        INTEGER NOT NULL DEFAULT 0,
  total_gross_local     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_paye_local      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_social_employee NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_social_employer NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_net_local       NUMERIC(15,2) NOT NULL DEFAULT 0,
  local_currency        CHAR(3) NOT NULL,
  exchange_rate         NUMERIC(18,8) NOT NULL DEFAULT 1,
  exchange_rate_source  VARCHAR(80) NOT NULL DEFAULT 'seed',
  exchange_rate_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  tax_ruleset_hash      VARCHAR(64) NOT NULL DEFAULT '',
  prepared_by           UUID NOT NULL,
  prepared_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  reversed_by_run_id    UUID REFERENCES {{SCHEMA}}.payroll_runs(id),
  computation_state     JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  version               INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT payroll_run_reference_unique UNIQUE (run_reference),
  CONSTRAINT payroll_period_valid CHECK (pay_period_end >= pay_period_start),
  CONSTRAINT payroll_approver_differs CHECK (approved_by IS NULL OR approved_by <> prepared_by)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_run_period_unique ON {{SCHEMA}}.payroll_runs
  (country_code, pay_period_start, pay_period_end)
  WHERE status NOT IN ('reversed', 'failed');

CREATE TABLE IF NOT EXISTS {{SCHEMA}}.payroll_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  payroll_run_id        UUID NOT NULL REFERENCES {{SCHEMA}}.payroll_runs(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL,
  employee_number       VARCHAR(30) NOT NULL,
  contract_id           UUID NOT NULL,
  gross_total_local     NUMERIC(15,2) NOT NULL,
  taxable_income_local  NUMERIC(15,2) NOT NULL,
  paye_local            NUMERIC(15,2) NOT NULL DEFAULT 0,
  social_employee_local NUMERIC(15,2) NOT NULL DEFAULT 0,
  social_employer_local NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_pay_local         NUMERIC(15,2) NOT NULL,
  days_worked           NUMERIC(5,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_record_unique UNIQUE (payroll_run_id, employee_id),
  CONSTRAINT payroll_net_not_negative CHECK (net_pay_local >= 0)
);

CREATE TABLE IF NOT EXISTS {{SCHEMA}}.payroll_record_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_record_id UUID NOT NULL REFERENCES {{SCHEMA}}.payroll_records(id) ON DELETE CASCADE,
  line_type         VARCHAR(40) NOT NULL,
  line_code         VARCHAR(40) NOT NULL,
  description       VARCHAR(200) NOT NULL,
  amount            NUMERIC(15,2) NOT NULL,
  currency          CHAR(3) NOT NULL,
  calculation_basis NUMERIC(15,2),
  rate_applied      NUMERIC(8,4),
  display_order     SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT payroll_line_type_valid CHECK (line_type IN
    ('earning','statutory_deduction','voluntary_deduction','employer_contribution','information'))
);

CREATE OR REPLACE FUNCTION {{SCHEMA}}.prevent_payroll_run_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('approved', 'disbursed') AND NEW.status NOT IN ('disbursed', 'reversed') THEN
    RAISE EXCEPTION 'NGOIS-PAY-0040: approved payroll run is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payroll_runs_immutable ON {{SCHEMA}}.payroll_runs;
CREATE TRIGGER payroll_runs_immutable
  BEFORE UPDATE ON {{SCHEMA}}.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION {{SCHEMA}}.prevent_payroll_run_mutation();

GRANT USAGE ON SCHEMA {{SCHEMA}} TO svc_hr_payroll;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA {{SCHEMA}} TO svc_hr_payroll;
