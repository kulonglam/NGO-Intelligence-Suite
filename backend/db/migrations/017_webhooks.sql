-- 017_webhooks.sql — outbound webhook subscriptions + deliveries (SDD §34.2.2)

INSERT INTO permissions (code) VALUES
  ('webhook:subscription:manage'),
  ('webhook:delivery:read')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code, scoped, own_only, maker_checker, break_glass, purpose_logged, dpo_required)
VALUES
  ('org_admin', 'webhook:subscription:manage', false, false, false, false, false, false),
  ('org_admin', 'webhook:delivery:read', false, false, false, false, false, false),
  ('super_admin', 'webhook:subscription:manage', false, false, false, true, false, false),
  ('super_admin', 'webhook:delivery:read', false, false, false, true, false, false)
ON CONFLICT (role, permission_code) DO UPDATE SET
  scoped = EXCLUDED.scoped,
  own_only = EXCLUDED.own_only,
  maker_checker = EXCLUDED.maker_checker,
  break_glass = EXCLUDED.break_glass,
  purpose_logged = EXCLUDED.purpose_logged,
  dpo_required = EXCLUDED.dpo_required;

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  endpoint_url    TEXT NOT NULL,
  secret_enc      TEXT NOT NULL,
  event_types     TEXT[] NOT NULL DEFAULT ARRAY['*']::text[],
  status          TEXT NOT NULL DEFAULT 'active',
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_at    TIMESTAMPTZ,
  last_error      TEXT,
  CONSTRAINT webhook_sub_status_valid CHECK (status IN ('active', 'suspended', 'disabled'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_sub_tenant ON webhook_subscriptions (tenant_id, status);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  subscription_id   UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_id          UUID NOT NULL,
  event_type        TEXT NOT NULL,
  attempt           INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'pending',
  http_status       INTEGER,
  latency_ms        INTEGER,
  response_excerpt  TEXT,
  next_attempt_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  CONSTRAINT webhook_del_status_valid CHECK (status IN
    ('pending', 'success', 'failed', 'exhausted'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_del_sub ON webhook_deliveries (subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_del_pending ON webhook_deliveries (status, next_attempt_at)
  WHERE status = 'pending';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['webhook_subscriptions', 'webhook_deliveries']
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

-- Dispatcher may scan due deliveries across tenants when app.relay_mode=on
CREATE POLICY webhook_subscriptions_relay ON webhook_subscriptions
  USING (current_setting('app.relay_mode', true) = 'on')
  WITH CHECK (current_setting('app.relay_mode', true) = 'on');
CREATE POLICY webhook_deliveries_relay ON webhook_deliveries
  USING (current_setting('app.relay_mode', true) = 'on')
  WITH CHECK (current_setting('app.relay_mode', true) = 'on');

GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_subscriptions, webhook_deliveries TO ngois_app;
