-- 007_reporting.sql — report jobs and artefacts (Phase 2 reporting-service)

CREATE TYPE report_job_status AS ENUM ('queued', 'running', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS report_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  job_type        VARCHAR(40) NOT NULL,
  status          report_job_status NOT NULL DEFAULT 'queued',
  requested_by    UUID,
  input           JSONB NOT NULL DEFAULT '{}'::jsonb,
  result          JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message   TEXT,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_jobs_type_valid CHECK (job_type IN ('payslip_export', 'grant_export', 'portfolio_csv'))
);

CREATE TABLE IF NOT EXISTS report_artifacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  job_id          UUID NOT NULL REFERENCES report_jobs(id) ON DELETE CASCADE,
  format          VARCHAR(10) NOT NULL,
  storage_path    TEXT NOT NULL,
  byte_size       BIGINT NOT NULL DEFAULT 0,
  checksum_sha256 TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_artifacts_format_valid CHECK (format IN ('csv', 'html', 'json'))
);

CREATE INDEX IF NOT EXISTS idx_report_jobs_tenant ON report_jobs (tenant_id, created_at DESC);

ALTER TABLE report_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE report_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_artifacts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_jobs_tenant_isolation ON report_jobs;
CREATE POLICY report_jobs_tenant_isolation ON report_jobs
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS report_artifacts_tenant_isolation ON report_artifacts;
CREATE POLICY report_artifacts_tenant_isolation ON report_artifacts
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON report_jobs, report_artifacts TO ngois_app;
