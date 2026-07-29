-- 003_data_foundation.sql
-- Audit hash chain, grant finance tables, file objects, outbox relay columns, tenant DEKs

CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'NGOIS-DB-0002: table % is append-only', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TYPE disbursement_status AS ENUM (
    'recorded', 'pending_approval', 'approved', 'reconciled', 'disputed', 'reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE scan_status AS ENUM (
    'pending', 'clean', 'infected', 'error', 'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Outbox relay columns (table created in 001 as `outbox`)
-- ---------------------------------------------------------------------------
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS actor_user_id uuid;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS publish_attempts smallint NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_error text;

-- ---------------------------------------------------------------------------
-- Per-tenant data-encryption keys (dev stand-in for Cloud KMS envelope)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_data_keys (
  tenant_id       uuid PRIMARY KEY REFERENCES tenants(id),
  key_version     integer NOT NULL DEFAULT 1,
  wrapped_dek     bytea NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  rotated_at      timestamptz
);

-- ---------------------------------------------------------------------------
-- Audit events (hash-chained, append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  sequence        bigint NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor_user_id   uuid,
  actor_email     varchar(255),
  actor_role      varchar(50),
  actor_type      varchar(20) NOT NULL DEFAULT 'user',
  action          varchar(80) NOT NULL,
  resource_type   varchar(60) NOT NULL,
  resource_id     uuid,
  resource_label  varchar(200),
  before_state    jsonb,
  after_state     jsonb,
  changed_fields  text[],
  purpose         varchar(80),
  outcome         varchar(20) NOT NULL DEFAULT 'success',
  ip_address      inet,
  user_agent      text,
  correlation_id  varchar(64),
  service_name    varchar(50) NOT NULL,
  previous_hash   varchar(64),
  record_hash     varchar(64) NOT NULL,
  PRIMARY KEY (tenant_id, sequence),
  CONSTRAINT audit_actor_type_valid CHECK (actor_type IN ('user','service','system','anonymous')),
  CONSTRAINT audit_outcome_valid CHECK (outcome IN ('success','failure','denied')),
  CONSTRAINT audit_record_hash_len CHECK (char_length(record_hash) = 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_events_id_uidx ON audit_events (id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_events (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events (resource_type, resource_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_events (correlation_id);

DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events;
CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ---------------------------------------------------------------------------
-- Grant budgets + lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grant_budgets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  grant_id        uuid NOT NULL REFERENCES grants(id) ON DELETE RESTRICT,
  version_number  integer NOT NULL DEFAULT 1,
  is_current      boolean NOT NULL DEFAULT true,
  total_budgeted  numeric(15,2) NOT NULL CHECK (total_budgeted >= 0),
  currency        char(3) NOT NULL,
  approved_at     timestamptz,
  approved_by     uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1,
  is_deleted      boolean NOT NULL DEFAULT false,
  CONSTRAINT grant_budgets_version_unique UNIQUE (grant_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_budgets_one_current
  ON grant_budgets (grant_id) WHERE is_current AND NOT is_deleted;

CREATE TABLE IF NOT EXISTS budget_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  grant_budget_id   uuid NOT NULL REFERENCES grant_budgets(id) ON DELETE CASCADE,
  parent_line_id    uuid REFERENCES budget_lines(id),
  line_code         varchar(50) NOT NULL,
  category          varchar(100) NOT NULL,
  description       varchar(500) NOT NULL,
  budgeted_amount   numeric(15,2) NOT NULL CHECK (budgeted_amount >= 0),
  committed_amount  numeric(15,2) NOT NULL DEFAULT 0 CHECK (committed_amount >= 0),
  spent_amount      numeric(15,2) NOT NULL DEFAULT 0 CHECK (spent_amount >= 0),
  currency          char(3) NOT NULL,
  fiscal_year       integer,
  is_staff_cost     boolean NOT NULL DEFAULT false,
  display_order     integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           integer NOT NULL DEFAULT 1,
  is_deleted        boolean NOT NULL DEFAULT false,
  CONSTRAINT budget_lines_code_unique UNIQUE (grant_budget_id, line_code),
  CONSTRAINT budget_lines_no_self_parent CHECK (parent_line_id IS NULL OR parent_line_id <> id)
);

-- ---------------------------------------------------------------------------
-- Disbursements (maker-checker at DB level)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disbursements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  grant_id               uuid NOT NULL REFERENCES grants(id) ON DELETE RESTRICT,
  tranche_number         integer,
  amount                 numeric(15,2) NOT NULL,
  currency               char(3) NOT NULL,
  amount_base            numeric(15,2),
  exchange_rate          numeric(18,8),
  exchange_rate_source   varchar(80),
  exchange_rate_date     date,
  received_date          date NOT NULL,
  value_date             date,
  bank_reference         varchar(200),
  payment_method         varchar(40),
  status                 disbursement_status NOT NULL DEFAULT 'recorded',
  confirmation_file_id   uuid,
  notes                  text,
  approved_by            uuid REFERENCES users(id),
  approved_at            timestamptz,
  reconciled_at          timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES users(id),
  updated_by             uuid REFERENCES users(id),
  version                integer NOT NULL DEFAULT 1,
  is_deleted             boolean NOT NULL DEFAULT false,
  CONSTRAINT disbursements_amount_positive CHECK (amount > 0),
  CONSTRAINT disbursements_conversion_complete CHECK (
    amount_base IS NULL OR (
      exchange_rate IS NOT NULL
      AND exchange_rate_source IS NOT NULL
      AND exchange_rate_date IS NOT NULL
    )
  ),
  CONSTRAINT disbursements_approver_differs CHECK (
    approved_by IS NULL OR approved_by <> created_by
  ),
  CONSTRAINT disbursements_bank_ref_unique UNIQUE (tenant_id, grant_id, bank_reference)
);

CREATE INDEX IF NOT EXISTS idx_disbursements_grant ON disbursements (grant_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_disbursements_date ON disbursements (tenant_id, received_date DESC);

-- ---------------------------------------------------------------------------
-- File objects (tenant-prefixed storage keys enforced in file-service)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_objects (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  storage_bucket        varchar(100) NOT NULL,
  storage_key           varchar(500) NOT NULL,
  original_filename     varchar(300) NOT NULL,
  content_type          varchar(150) NOT NULL,
  detected_content_type varchar(150),
  size_bytes            bigint NOT NULL,
  checksum_sha256       varchar(64),
  purpose               varchar(50) NOT NULL,
  owner_resource_type   varchar(60),
  owner_resource_id     uuid,
  contains_pii          boolean NOT NULL DEFAULT false,
  scan_status           scan_status NOT NULL DEFAULT 'pending',
  scanned_at            timestamptz,
  exif_stripped         boolean NOT NULL DEFAULT false,
  uploaded_by           uuid REFERENCES users(id),
  upload_completed_at   timestamptz,
  retention_until       date,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  version               integer NOT NULL DEFAULT 1,
  is_deleted            boolean NOT NULL DEFAULT false,
  CONSTRAINT file_storage_key_unique UNIQUE (storage_bucket, storage_key),
  CONSTRAINT file_size_positive CHECK (size_bytes > 0),
  CONSTRAINT file_size_limit CHECK (size_bytes <= 104857600)
);

CREATE INDEX IF NOT EXISTS idx_files_owner ON file_objects (owner_resource_type, owner_resource_id);
CREATE INDEX IF NOT EXISTS idx_files_tenant ON file_objects (tenant_id) WHERE NOT is_deleted;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS grant_budgets_updated_at ON grant_budgets;
CREATE TRIGGER grant_budgets_updated_at BEFORE UPDATE ON grant_budgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS budget_lines_updated_at ON budget_lines;
CREATE TRIGGER budget_lines_updated_at BEFORE UPDATE ON budget_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS disbursements_updated_at ON disbursements;
CREATE TRIGGER disbursements_updated_at BEFORE UPDATE ON disbursements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS file_objects_updated_at ON file_objects;
CREATE TRIGGER file_objects_updated_at BEFORE UPDATE ON file_objects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS - FORCE on every tenant-owned table
-- ---------------------------------------------------------------------------
ALTER TABLE grant_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_budgets FORCE ROW LEVEL SECURITY;
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE disbursements FORCE ROW LEVEL SECURITY;
ALTER TABLE file_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_data_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_data_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grant_budgets_tenant_isolation ON grant_budgets;
CREATE POLICY grant_budgets_tenant_isolation ON grant_budgets
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS budget_lines_tenant_isolation ON budget_lines;
CREATE POLICY budget_lines_tenant_isolation ON budget_lines
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS disbursements_tenant_isolation ON disbursements;
CREATE POLICY disbursements_tenant_isolation ON disbursements
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS file_objects_tenant_isolation ON file_objects;
CREATE POLICY file_objects_tenant_isolation ON file_objects
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS audit_events_tenant_isolation ON audit_events;
CREATE POLICY audit_events_tenant_isolation ON audit_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_data_keys_tenant_isolation ON tenant_data_keys;
CREATE POLICY tenant_data_keys_tenant_isolation ON tenant_data_keys
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS outbox_tenant_isolation ON outbox;
CREATE POLICY outbox_tenant_isolation ON outbox
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Relay may drain all tenants when app.relay_mode=on (SET LOCAL in the relay transaction).
DROP POLICY IF EXISTS outbox_relay_mode ON outbox;
CREATE POLICY outbox_relay_mode ON outbox
  USING (current_setting('app.relay_mode', true) = 'on')
  WITH CHECK (current_setting('app.relay_mode', true) = 'on');

-- App role privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON grant_budgets, budget_lines, disbursements, file_objects TO ngois_app;
GRANT SELECT, INSERT ON audit_events TO ngois_app;
-- UPDATE/DELETE revoked by trigger; also revoke at GRANT level for defence in depth
REVOKE UPDATE, DELETE ON audit_events FROM ngois_app;
GRANT SELECT, INSERT, UPDATE ON tenant_data_keys TO ngois_app;
GRANT SELECT, INSERT, UPDATE ON outbox TO ngois_app;
