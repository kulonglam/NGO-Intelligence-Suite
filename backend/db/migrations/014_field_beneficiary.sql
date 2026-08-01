-- 014_field_beneficiary.sql — Phase 3 beneficiary registry + field-data sync

CREATE TABLE IF NOT EXISTS households (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  household_code  VARCHAR(40) NOT NULL,
  settlement      VARCHAR(200),
  admin_area      VARCHAR(120),
  shelter_type    VARCHAR(40),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted      BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT households_code_unique UNIQUE (tenant_id, household_code)
);

CREATE TABLE IF NOT EXISTS beneficiaries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  beneficiary_number  VARCHAR(40) NOT NULL,
  household_id        UUID REFERENCES households(id),
  display_name        VARCHAR(200) NOT NULL,
  first_name_encrypted BYTEA NOT NULL,
  last_name_encrypted  BYTEA NOT NULL,
  name_index          VARCHAR(64) NOT NULL,
  name_phonetic_index VARCHAR(64),
  phone_index         VARCHAR(64),
  national_id_index   VARCHAR(64),
  sex                 CHAR(1),
  birth_year          SMALLINT,
  admin_area          VARCHAR(120),
  status              VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted          BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT beneficiaries_number_unique UNIQUE (tenant_id, beneficiary_number),
  CONSTRAINT beneficiaries_sex_valid CHECK (sex IS NULL OR sex IN ('F','M','X','U')),
  CONSTRAINT beneficiaries_status_valid CHECK (status IN ('active','inactive','merged','erased'))
);

CREATE TABLE IF NOT EXISTS household_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  household_id    UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  beneficiary_id  UUID NOT NULL REFERENCES beneficiaries(id),
  relationship    VARCHAR(40) NOT NULL DEFAULT 'member',
  is_head         BOOLEAN NOT NULL DEFAULT false,
  age_band        VARCHAR(20),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT household_members_unique UNIQUE (tenant_id, household_id, beneficiary_id)
);

CREATE TABLE IF NOT EXISTS programmes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            VARCHAR(40) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT programmes_code_unique UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS programme_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  programme_id    UUID NOT NULL REFERENCES programmes(id),
  beneficiary_id  UUID NOT NULL REFERENCES beneficiaries(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'enrolled',
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at       TIMESTAMPTZ,
  CONSTRAINT programme_enrollments_unique UNIQUE (tenant_id, programme_id, beneficiary_id)
);

CREATE TABLE IF NOT EXISTS vulnerability_assessments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  beneficiary_id        UUID NOT NULL REFERENCES beneficiaries(id),
  household_id          UUID REFERENCES households(id),
  score                 SMALLINT NOT NULL,
  band                  VARCHAR(20) NOT NULL,
  scoring_model_version SMALLINT NOT NULL DEFAULT 2,
  factors               JSONB NOT NULL DEFAULT '{}'::jsonb,
  factors_missing       JSONB NOT NULL DEFAULT '[]'::jsonb,
  assessed_by           UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vulnerability_score_range CHECK (score BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS beneficiary_duplicate_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  subject_id      UUID NOT NULL REFERENCES beneficiaries(id),
  candidate_id    UUID NOT NULL REFERENCES beneficiaries(id),
  score           SMALLINT NOT NULL,
  priority        VARCHAR(20) NOT NULL,
  signals         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  CONSTRAINT duplicate_priority_valid CHECK (priority IN ('probable','possible')),
  CONSTRAINT duplicate_status_valid CHECK (status IN ('open','dismissed','merged')),
  CONSTRAINT duplicate_pair_differs CHECK (subject_id <> candidate_id)
);

CREATE TABLE IF NOT EXISTS beneficiary_merge_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  survivor_id     UUID NOT NULL,
  merged_id       UUID NOT NULL,
  merged_by       UUID,
  reversible_until TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at     TIMESTAMPTZ
);

-- Field data
CREATE TABLE IF NOT EXISTS form_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            VARCHAR(40) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT form_templates_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT form_templates_status_valid CHECK (status IN ('draft','published','archived'))
);

CREATE TABLE IF NOT EXISTS form_template_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  form_template_id UUID NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  definition      JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at    TIMESTAMPTZ,
  is_current      BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT form_versions_unique UNIQUE (tenant_id, form_template_id, version_number)
);

CREATE TABLE IF NOT EXISTS form_fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  form_version_id UUID NOT NULL REFERENCES form_template_versions(id) ON DELETE CASCADE,
  field_key       VARCHAR(80) NOT NULL,
  label           VARCHAR(200) NOT NULL,
  field_type      VARCHAR(40) NOT NULL DEFAULT 'text',
  required        BOOLEAN NOT NULL DEFAULT false,
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT form_fields_key_unique UNIQUE (form_version_id, field_key)
);

CREATE TABLE IF NOT EXISTS form_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  form_template_id UUID NOT NULL REFERENCES form_templates(id),
  user_id         UUID,
  programme_id    UUID REFERENCES programmes(id),
  valid_until     DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  client_uuid           UUID NOT NULL,
  form_version_id       UUID NOT NULL REFERENCES form_template_versions(id),
  beneficiary_id        UUID REFERENCES beneficiaries(id),
  captured_at           TIMESTAMPTZ NOT NULL,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_id             VARCHAR(80),
  status                VARCHAR(20) NOT NULL DEFAULT 'accepted',
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by            UUID,
  CONSTRAINT submissions_client_uuid_unique UNIQUE (tenant_id, client_uuid),
  CONSTRAINT submissions_status_valid CHECK (status IN
    ('accepted','rejected','flagged','pending_review'))
);

CREATE TABLE IF NOT EXISTS submission_values (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  field_key       VARCHAR(80) NOT NULL,
  value_text      TEXT,
  CONSTRAINT submission_values_unique UNIQUE (submission_id, field_key)
);

CREATE TABLE IF NOT EXISTS sync_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID,
  device_id       VARCHAR(80),
  cursor_token    TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  status          VARCHAR(20) NOT NULL DEFAULT 'open',
  CONSTRAINT sync_sessions_status_valid CHECK (status IN ('open','completed','aborted'))
);

CREATE TABLE IF NOT EXISTS submission_review_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  submission_id   UUID REFERENCES submissions(id),
  duplicate_flag_id UUID REFERENCES beneficiary_duplicate_flags(id),
  reason          VARCHAR(80) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'open',
  resolution      VARCHAR(40),
  resolved_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  CONSTRAINT review_status_valid CHECK (status IN ('open','resolved')),
  CONSTRAINT review_resolution_valid CHECK (
    resolution IS NULL OR resolution IN ('accept','reject','dismiss_duplicate')
  )
);

-- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'households','beneficiaries','household_members','programmes','programme_enrollments',
    'vulnerability_assessments','beneficiary_duplicate_flags','beneficiary_merge_log',
    'form_templates','form_template_versions','form_fields','form_assignments',
    'submissions','submission_values','sync_sessions','submission_review_queue'
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
  households, beneficiaries, household_members, programmes, programme_enrollments,
  vulnerability_assessments, beneficiary_duplicate_flags, beneficiary_merge_log,
  form_templates, form_template_versions, form_fields, form_assignments,
  submissions, submission_values, sync_sessions, submission_review_queue
TO ngois_app;
