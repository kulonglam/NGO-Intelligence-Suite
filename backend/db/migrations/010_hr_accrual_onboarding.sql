-- 010_hr_accrual_onboarding.sql — leave accrual ledger + onboarding checklist

CREATE TABLE IF NOT EXISTS leave_accrual_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  period_year     SMALLINT NOT NULL,
  period_month    SMALLINT NOT NULL,
  employees_accrued INTEGER NOT NULL DEFAULT 0,
  run_by          UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_accrual_runs_period UNIQUE (tenant_id, period_year, period_month),
  CONSTRAINT leave_accrual_month_valid CHECK (period_month BETWEEN 1 AND 12)
);

CREATE TABLE IF NOT EXISTS leave_accrual_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  accrual_run_id  UUID NOT NULL REFERENCES leave_accrual_runs(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id),
  leave_type_id   UUID NOT NULL REFERENCES leave_types(id),
  days_accrued    NUMERIC(6,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS onboarding_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            VARCHAR(40) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  task_defs       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_templates_unique UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS onboarding_checklists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  employee_id     UUID NOT NULL REFERENCES employees(id),
  template_id     UUID REFERENCES onboarding_templates(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_checklists_employee UNIQUE (tenant_id, employee_id),
  CONSTRAINT onboarding_status_valid CHECK (status IN ('in_progress','completed','cancelled'))
);

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  checklist_id    UUID NOT NULL REFERENCES onboarding_checklists(id) ON DELETE CASCADE,
  task_code       VARCHAR(40) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  completed_at    TIMESTAMPTZ,
  completed_by    UUID,
  CONSTRAINT onboarding_tasks_status_valid CHECK (status IN ('pending','done','skipped'))
);

ALTER TABLE leave_accrual_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_accrual_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE leave_accrual_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_accrual_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_checklists FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY leave_accrual_runs_tenant ON leave_accrual_runs
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY leave_accrual_lines_tenant ON leave_accrual_lines
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY onboarding_templates_tenant ON onboarding_templates
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY onboarding_checklists_tenant ON onboarding_checklists
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY onboarding_tasks_tenant ON onboarding_tasks
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON leave_accrual_runs, leave_accrual_lines,
  onboarding_templates, onboarding_checklists, onboarding_tasks TO ngois_app;
GRANT SELECT ON leave_accrual_runs, leave_accrual_lines TO svc_hr_payroll;
