-- 016_phase4_intelligence.sql — Phase 4 analytics, AI, IATI, FinOps

ALTER TABLE grants ADD COLUMN IF NOT EXISTS iati_eligible BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE grants ADD COLUMN IF NOT EXISTS admin_area_l2 VARCHAR(120);

-- Analytics
CREATE TABLE IF NOT EXISTS kpi_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            VARCHAR(40) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  unit            VARCHAR(40) NOT NULL DEFAULT 'count',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kpi_definitions_code_unique UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  kpi_code        VARCHAR(40) NOT NULL,
  value_numeric   NUMERIC(18,4) NOT NULL,
  as_of           TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS indicator_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            VARCHAR(40) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT indicator_definitions_code_unique UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS indicator_values (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  indicator_code  VARCHAR(40) NOT NULL,
  period          VARCHAR(20) NOT NULL,
  value_numeric   NUMERIC(18,4) NOT NULL,
  disaggregation  JSONB NOT NULL DEFAULT '{}'::jsonb,
  as_of           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            VARCHAR(40) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  panels          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_configs_code_unique UNIQUE (tenant_id, code)
);

-- AI
CREATE TABLE IF NOT EXISTS tenant_ai_settings (
  tenant_id           UUID PRIMARY KEY REFERENCES tenants(id),
  ai_enabled          BOOLEAN NOT NULL DEFAULT true,
  monthly_token_budget INTEGER NOT NULL DEFAULT 100000,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_prompts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            VARCHAR(80) NOT NULL,
  version         VARCHAR(20) NOT NULL,
  template        TEXT NOT NULL,
  is_current      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_prompts_unique UNIQUE (tenant_id, code, version)
);

CREATE TABLE IF NOT EXISTS ai_generations (
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
  context_figures  JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_status  VARCHAR(20) NOT NULL DEFAULT 'unapproved',
  approved_by      UUID REFERENCES users(id),
  approved_at      TIMESTAMPTZ,
  edited_before_use BOOLEAN,
  requested_by     UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_approval_valid CHECK (approval_status IN
      ('unapproved','approved','rejected','discarded')),
  CONSTRAINT ai_approved_has_approver CHECK
      (approval_status <> 'approved' OR approved_by IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS ai_review_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  generation_id   UUID NOT NULL REFERENCES ai_generations(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  CONSTRAINT ai_review_status_valid CHECK (status IN ('pending','resolved'))
);

CREATE TABLE IF NOT EXISTS ai_token_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  period_yyyymm   CHAR(7) NOT NULL,
  tokens_used     INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_token_usage_unique UNIQUE (tenant_id, period_yyyymm)
);

CREATE TABLE IF NOT EXISTS ai_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  generation_id   UUID NOT NULL REFERENCES ai_generations(id) ON DELETE CASCADE,
  rating          SMALLINT,
  comment         TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- IATI + FinOps
CREATE TABLE IF NOT EXISTS iati_publications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  grant_id        UUID REFERENCES grants(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'published_local',
  checksum        VARCHAR(64) NOT NULL,
  artifact_path   TEXT NOT NULL,
  exclusions_applied JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  CONSTRAINT iati_pub_status_valid CHECK (status IN
    ('preview','published_local','failed','superseded'))
);

CREATE TABLE IF NOT EXISTS tenant_cost_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  cost_date       DATE NOT NULL,
  service_name    VARCHAR(80) NOT NULL,
  cost_usd        NUMERIC(12,4) NOT NULL DEFAULT 0,
  tokens          INTEGER NOT NULL DEFAULT 0,
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT tenant_cost_daily_unique UNIQUE (tenant_id, cost_date, service_name)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'kpi_definitions','kpi_snapshots','indicator_definitions','indicator_values','dashboard_configs',
    'tenant_ai_settings','ai_prompts','ai_generations','ai_review_queue','ai_token_usage','ai_feedback',
    'iati_publications','tenant_cost_daily'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t, t
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  kpi_definitions, kpi_snapshots, indicator_definitions, indicator_values, dashboard_configs,
  tenant_ai_settings, ai_prompts, ai_generations, ai_review_queue, ai_token_usage, ai_feedback,
  iati_publications, tenant_cost_daily
TO ngois_app;
