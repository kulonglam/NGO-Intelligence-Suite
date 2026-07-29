-- 012_quotas_compliance.sql — tenant quotas + erasure/DSAR

CREATE TABLE IF NOT EXISTS tenant_quotas (
  tenant_id              UUID PRIMARY KEY REFERENCES tenants(id),
  api_rpm                INTEGER NOT NULL DEFAULT 600,
  api_rpm_per_user       INTEGER NOT NULL DEFAULT 120,
  concurrent_reports     INTEGER NOT NULL DEFAULT 3,
  report_minutes_per_day INTEGER NOT NULL DEFAULT 60,
  bulk_export_rows_day   INTEGER NOT NULL DEFAULT 250000,
  object_storage_gb      INTEGER NOT NULL DEFAULT 100,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erasure_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  subject_type        VARCHAR(30) NOT NULL,
  subject_id          UUID NOT NULL,
  status              VARCHAR(30) NOT NULL DEFAULT 'pending_assessment',
  verification_method VARCHAR(80),
  recorded_by         UUID,
  assessed_by         UUID,
  approved_by         UUID,
  executed_by         UUID,
  reason              TEXT,
  retain_note         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at         TIMESTAMPTZ,
  CONSTRAINT erasure_subject_type_valid CHECK (subject_type IN ('employee','user','beneficiary')),
  CONSTRAINT erasure_status_valid CHECK (status IN
    ('pending_assessment','approved','executed','rejected','partial')),
  CONSTRAINT erasure_approver_differs CHECK (
    approved_by IS NULL OR recorded_by IS NULL OR approved_by <> recorded_by
  )
);

CREATE TABLE IF NOT EXISTS erasure_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  erasure_request_id UUID NOT NULL REFERENCES erasure_requests(id),
  resource_type   VARCHAR(60) NOT NULL,
  resource_id     UUID,
  action          VARCHAR(40) NOT NULL,
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dsar_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  subject_type    VARCHAR(30) NOT NULL,
  subject_id      UUID NOT NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending',
  package_path    TEXT,
  requested_by    UUID,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dsar_subject_type_valid CHECK (subject_type IN ('employee','user','beneficiary')),
  CONSTRAINT dsar_status_valid CHECK (status IN ('pending','ready','failed'))
);

ALTER TABLE tenant_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_quotas FORCE ROW LEVEL SECURITY;
ALTER TABLE erasure_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE erasure_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE erasure_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE erasure_log FORCE ROW LEVEL SECURITY;
ALTER TABLE dsar_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsar_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_quotas_tenant ON tenant_quotas
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY erasure_requests_tenant ON erasure_requests
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY erasure_log_tenant ON erasure_log
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY dsar_requests_tenant ON dsar_requests
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_quotas, erasure_requests,
  erasure_log, dsar_requests TO ngois_app;

-- Seed default quotas for existing tenants
INSERT INTO tenant_quotas (tenant_id)
SELECT id FROM tenants WHERE deleted_at IS NULL
ON CONFLICT DO NOTHING;
