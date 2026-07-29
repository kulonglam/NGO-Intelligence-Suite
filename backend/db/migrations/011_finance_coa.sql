-- 011_finance_coa.sql — chart of accounts + expenses + light journals

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  account_code    VARCHAR(30) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  account_type    VARCHAR(30) NOT NULL,
  parent_id       UUID REFERENCES chart_of_accounts(id),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coa_code_unique UNIQUE (tenant_id, account_code),
  CONSTRAINT coa_type_valid CHECK (account_type IN
    ('asset','liability','equity','revenue','expense'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  grant_id        UUID REFERENCES grants(id),
  account_id      UUID NOT NULL REFERENCES chart_of_accounts(id),
  expense_number  VARCHAR(40) NOT NULL,
  description     VARCHAR(500) NOT NULL,
  amount          NUMERIC(15,2) NOT NULL,
  currency        CHAR(3) NOT NULL,
  expense_date    DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft',
  submitted_by    UUID,
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expenses_number_unique UNIQUE (tenant_id, expense_number),
  CONSTRAINT expenses_amount_positive CHECK (amount > 0),
  CONSTRAINT expenses_status_valid CHECK (status IN
    ('draft','submitted','approved','rejected')),
  CONSTRAINT expenses_approver_differs CHECK (
    approved_by IS NULL OR submitted_by IS NULL OR approved_by <> submitted_by
  )
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  entry_number    VARCHAR(40) NOT NULL,
  entry_date      DATE NOT NULL,
  memo            VARCHAR(500),
  source_type     VARCHAR(40),
  source_id       UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT journal_entries_number_unique UNIQUE (tenant_id, entry_number)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES chart_of_accounts(id),
  debit           NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(15,2) NOT NULL DEFAULT 0,
  line_order      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT journal_lines_side CHECK (debit >= 0 AND credit >= 0),
  CONSTRAINT journal_lines_one_side CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY coa_tenant ON chart_of_accounts
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY expenses_tenant ON expenses
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY journal_entries_tenant ON journal_entries
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY journal_lines_tenant ON journal_lines
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON chart_of_accounts, expenses,
  journal_entries, journal_lines TO ngois_app;
