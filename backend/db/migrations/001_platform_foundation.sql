-- 001_platform_foundation.sql
-- Phase 1 foundation: tenants, users, grants + RLS

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenants (platform-owned; no RLS — accessed by tenant-service with elevated role)
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  status          text NOT NULL CHECK (status IN ('provisioning','active','suspended','offboarding','deleted')),
  primary_country char(2) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- ---------------------------------------------------------------------------
-- Users (tenant-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  email           text NOT NULL,
  display_name    text NOT NULL,
  role            text NOT NULL CHECK (role IN (
                    'super_admin','org_admin','finance_manager','hr_manager',
                    'm_e_officer','field_officer','donor_viewer','auditor'
                  )),
  password_hash   text NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','invited')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (tenant_id, email)
);

CREATE INDEX users_tenant_id_idx ON users (tenant_id);

-- ---------------------------------------------------------------------------
-- Grants (tenant-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  grant_number    text NOT NULL,
  title           text NOT NULL,
  donor_name      text NOT NULL,
  currency        char(3) NOT NULL,
  total_budget    numeric(15,2) NOT NULL CHECK (total_budget >= 0),
  status          text NOT NULL CHECK (status IN (
                    'draft','submitted','active','closing','closed','cancelled'
                  )),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  version         integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, grant_number),
  CHECK (end_date >= start_date)
);

CREATE INDEX grants_tenant_id_idx ON grants (tenant_id);
CREATE INDEX grants_tenant_status_idx ON grants (tenant_id, status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Outbox (per SDD ch 11 / ADR-0011)
-- ---------------------------------------------------------------------------
CREATE TABLE outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  aggregate_type  text NOT NULL,
  aggregate_id    uuid NOT NULL,
  event_type      text NOT NULL,
  schema_version  integer NOT NULL DEFAULT 1,
  payload         jsonb NOT NULL,
  correlation_id  text NOT NULL,
  causation_id    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz
);

CREATE INDEX outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER grants_updated_at BEFORE UPDATE ON grants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- Session variable: app.tenant_id (uuid as text), set via SET LOCAL
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY grants_tenant_isolation ON grants
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY outbox_tenant_isolation ON outbox
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Application role used by services (not a superuser; subject to RLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ngois_app') THEN
    CREATE ROLE ngois_app LOGIN PASSWORD 'ngois_app_dev';
  END IF;
END$$;

GRANT CONNECT ON DATABASE ngois TO ngois_app;
GRANT USAGE ON SCHEMA public TO ngois_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ngois_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ngois_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ngois_app;

-- Tenants table: app role can read; writes via migration/seed/elevated for now
-- (tenant-service will use a controlled path). Allow SELECT for lookup by slug in auth.
GRANT SELECT, INSERT, UPDATE ON tenants TO ngois_app;
