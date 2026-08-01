-- Per-tenant module entitlements and feature flags (SDD §20.4 / §20.5 — runtime config).

CREATE TABLE IF NOT EXISTS tenant_module_entitlements (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id   VARCHAR(40) NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, module_id)
);

CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag_key    VARCHAR(80) NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, flag_key)
);

CREATE INDEX IF NOT EXISTS tenant_module_entitlements_tenant_idx
  ON tenant_module_entitlements (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_feature_flags_tenant_idx
  ON tenant_feature_flags (tenant_id);
