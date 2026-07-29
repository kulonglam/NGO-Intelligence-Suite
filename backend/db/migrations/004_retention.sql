-- 004_retention.sql — retention policies, legal holds, sweep runs (Phase 1 framework)

CREATE TABLE IF NOT EXISTS retention_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  resource_type   varchar(60) NOT NULL,
  retain_days     integer NOT NULL CHECK (retain_days > 0),
  archive_days    integer NOT NULL DEFAULT 0 CHECK (archive_days >= 0),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_policies_unique UNIQUE (tenant_id, resource_type)
);

CREATE TABLE IF NOT EXISTS legal_holds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  scope_type      varchar(40) NOT NULL,
  scope_id        uuid,
  reason          text NOT NULL,
  placed_by       uuid,
  placed_at       timestamptz NOT NULL DEFAULT now(),
  released_at     timestamptz,
  CONSTRAINT legal_holds_scope_valid CHECK (scope_type IN ('tenant','grant','beneficiary','file'))
);

CREATE TABLE IF NOT EXISTS retention_sweep_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES tenants(id),
  dry_run         boolean NOT NULL DEFAULT true,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  would_affect    integer NOT NULL DEFAULT 0,
  affected        integer NOT NULL DEFAULT 0,
  report          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          varchar(20) NOT NULL DEFAULT 'running',
  CONSTRAINT retention_sweep_status_valid CHECK (status IN ('running','completed','failed','blocked'))
);

CREATE INDEX IF NOT EXISTS idx_files_retention
  ON file_objects (retention_until)
  WHERE retention_until IS NOT NULL AND NOT is_deleted;

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_holds FORCE ROW LEVEL SECURITY;
ALTER TABLE retention_sweep_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_sweep_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retention_policies_tenant_isolation ON retention_policies;
CREATE POLICY retention_policies_tenant_isolation ON retention_policies
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS legal_holds_tenant_isolation ON legal_holds;
CREATE POLICY legal_holds_tenant_isolation ON legal_holds
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS retention_sweep_runs_tenant_isolation ON retention_sweep_runs;
CREATE POLICY retention_sweep_runs_tenant_isolation ON retention_sweep_runs
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON retention_policies, legal_holds, retention_sweep_runs TO ngois_app;
