-- 015_lms_notifications_devices.sql — Phase 3 full close: LMS, notifications, devices, paper

-- Notification permissions (not in 002)
INSERT INTO permissions (code) VALUES ('notification:send') ON CONFLICT (code) DO NOTHING;
INSERT INTO permissions (code) VALUES ('notification:template:admin') ON CONFLICT (code) DO NOTHING;
INSERT INTO permissions (code) VALUES ('notification:delivery:read') ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code, scoped, own_only, maker_checker, break_glass, purpose_logged, dpo_required)
VALUES
  ('org_admin', 'notification:send', false, false, false, false, false, false),
  ('org_admin', 'notification:template:admin', false, false, false, false, false, false),
  ('org_admin', 'notification:delivery:read', false, false, false, false, false, false),
  ('hr_manager', 'notification:send', false, false, false, false, false, false),
  ('hr_manager', 'notification:delivery:read', false, false, false, false, false, false),
  ('finance_manager', 'notification:send', false, false, false, false, false, false),
  ('finance_manager', 'notification:delivery:read', false, false, false, false, false, false)
ON CONFLICT (role, permission_code) DO UPDATE SET
  scoped = EXCLUDED.scoped, own_only = EXCLUDED.own_only;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('email','sms','in_app','webhook');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status AS ENUM ('queued','sending','sent','delivered','failed','suppressed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE enrollment_source AS ENUM ('manual','mandatory_rule','self','import');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE enrollment_status AS ENUM ('assigned','in_progress','completed','overdue','waived','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- LMS
CREATE TABLE IF NOT EXISTS courses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  code         VARCHAR(40) NOT NULL,
  title        VARCHAR(300) NOT NULL,
  category     VARCHAR(60),
  is_mandatory_default BOOLEAN NOT NULL DEFAULT FALSE,
  current_version_id UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version      INTEGER NOT NULL DEFAULT 1,
  is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT courses_code_unique UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS course_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL,
  title             VARCHAR(300) NOT NULL,
  description       TEXT,
  pass_threshold_percent SMALLINT NOT NULL DEFAULT 80,
  estimated_minutes INTEGER,
  max_attempts      SMALLINT,
  validity_months   SMALLINT,
  language          VARCHAR(10) NOT NULL DEFAULT 'en-GB',
  scorm_package_ref VARCHAR(300),
  is_published      BOOLEAN NOT NULL DEFAULT FALSE,
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT course_version_unique UNIQUE (course_id, version_number),
  CONSTRAINT pass_threshold_valid CHECK (pass_threshold_percent BETWEEN 1 AND 100)
);

CREATE TABLE IF NOT EXISTS modules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  title             VARCHAR(300) NOT NULL,
  display_order     SMALLINT NOT NULL,
  is_required       BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT module_order_unique UNIQUE (course_version_id, display_order)
);

CREATE TABLE IF NOT EXISTS lessons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  module_id     UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title         VARCHAR(300) NOT NULL,
  content_type  VARCHAR(20) NOT NULL DEFAULT 'text',
  content_body  TEXT,
  content_file_id UUID,
  duration_minutes SMALLINT,
  display_order SMALLINT NOT NULL,
  CONSTRAINT lesson_content_type_valid CHECK (content_type IN
      ('text','video','pdf','slides','scorm','external_link')),
  CONSTRAINT lesson_order_unique UNIQUE (module_id, display_order)
);

CREATE TABLE IF NOT EXISTS assessments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  module_id     UUID REFERENCES modules(id) ON DELETE CASCADE,
  course_version_id UUID REFERENCES course_versions(id) ON DELETE CASCADE,
  title         VARCHAR(300) NOT NULL,
  pass_threshold_percent SMALLINT NOT NULL DEFAULT 80,
  time_limit_minutes SMALLINT,
  shuffle_questions BOOLEAN NOT NULL DEFAULT TRUE,
  max_attempts  SMALLINT NOT NULL DEFAULT 3,
  cooldown_hours SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT assessment_scope CHECK
      ((module_id IS NOT NULL) <> (course_version_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type VARCHAR(20) NOT NULL DEFAULT 'single_choice',
  points        SMALLINT NOT NULL DEFAULT 1,
  explanation   TEXT,
  display_order SMALLINT NOT NULL,
  CONSTRAINT question_type_valid CHECK (question_type IN
      ('single_choice','multiple_choice','true_false','short_answer'))
);

CREATE TABLE IF NOT EXISTS answer_options (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  question_id   UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_text   TEXT NOT NULL,
  is_correct    BOOLEAN NOT NULL DEFAULT FALSE,
  display_order SMALLINT NOT NULL
);

CREATE TABLE IF NOT EXISTS mandatory_training_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  course_id           UUID NOT NULL REFERENCES courses(id),
  applies_to_type     VARCHAR(30) NOT NULL,
  applies_to_id       UUID,
  applies_to_value    VARCHAR(60),
  due_days_after_hire SMALLINT NOT NULL DEFAULT 30,
  recurrence_months   SMALLINT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mandatory_applies_valid CHECK (applies_to_type IN
      ('all_staff','department','position','employment_type','duty_station'))
);

CREATE TABLE IF NOT EXISTS lms_enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  employee_id       UUID NOT NULL,
  user_id           UUID REFERENCES users(id),
  course_version_id UUID NOT NULL REFERENCES course_versions(id),
  source            enrollment_source NOT NULL DEFAULT 'manual',
  mandatory_rule_id UUID REFERENCES mandatory_training_rules(id),
  is_mandatory      BOOLEAN NOT NULL DEFAULT FALSE,
  status            enrollment_status NOT NULL DEFAULT 'assigned',
  due_date          DATE,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  final_score       NUMERIC(5,2),
  attempts_used     SMALLINT NOT NULL DEFAULT 0,
  reminder_count    SMALLINT NOT NULL DEFAULT 0,
  escalated_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version           INTEGER NOT NULL DEFAULT 1,
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT lms_enrollment_unique UNIQUE (employee_id, course_version_id),
  CONSTRAINT lms_completion_consistent CHECK
      ((status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed'),
  CONSTRAINT lms_score_range CHECK (final_score IS NULL OR final_score BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  enrollment_id  UUID NOT NULL REFERENCES lms_enrollments(id) ON DELETE CASCADE,
  lesson_id      UUID NOT NULL REFERENCES lessons(id),
  completed_at   TIMESTAMPTZ,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  last_position  VARCHAR(100),
  CONSTRAINT lesson_progress_unique UNIQUE (enrollment_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  enrollment_id  UUID NOT NULL REFERENCES lms_enrollments(id) ON DELETE CASCADE,
  assessment_id  UUID NOT NULL REFERENCES assessments(id),
  attempt_number SMALLINT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at   TIMESTAMPTZ,
  score_percent  NUMERIC(5,2),
  passed         BOOLEAN,
  responses      JSONB,
  CONSTRAINT attempt_unique UNIQUE (enrollment_id, assessment_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS certificates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  enrollment_id      UUID NOT NULL REFERENCES lms_enrollments(id) ON DELETE RESTRICT,
  employee_id        UUID NOT NULL,
  certificate_number VARCHAR(50) NOT NULL,
  course_title       VARCHAR(300) NOT NULL,
  course_version_number INTEGER NOT NULL,
  issued_date        DATE NOT NULL,
  expires_date       DATE,
  file_id            UUID,
  verification_hash  VARCHAR(64) NOT NULL,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT certificate_number_unique UNIQUE (tenant_id, certificate_number),
  CONSTRAINT certificate_expiry_valid CHECK (expires_date IS NULL OR expires_date > issued_date)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notification_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  code          VARCHAR(80) NOT NULL,
  channel       notification_channel NOT NULL,
  locale        VARCHAR(10) NOT NULL DEFAULT 'en-GB',
  subject       VARCHAR(300),
  body_template TEXT NOT NULL,
  category      VARCHAR(40) NOT NULL,
  is_critical   BOOLEAN NOT NULL DEFAULT FALSE,
  allows_pii    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version       INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT notification_template_unique UNIQUE (tenant_id, code, channel, locale),
  CONSTRAINT sms_never_allows_pii CHECK (NOT (channel = 'sms' AND allows_pii))
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  category      VARCHAR(40) NOT NULL,
  channel       notification_channel NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  digest        BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT notification_pref_unique UNIQUE (tenant_id, user_id, category, channel)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  template_code   VARCHAR(80) NOT NULL,
  channel         notification_channel NOT NULL,
  recipient_user_id UUID REFERENCES users(id),
  recipient_address VARCHAR(255) NOT NULL,
  dedupe_key      VARCHAR(120),
  subject         VARCHAR(300),
  body_rendered   TEXT,
  status          delivery_status NOT NULL DEFAULT 'queued',
  attempts        SMALLINT NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(200),
  provider_response JSONB,
  triggered_by_event VARCHAR(100),
  correlation_id  VARCHAR(64),
  queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  failure_reason  TEXT,
  CONSTRAINT notification_dedupe_unique UNIQUE (tenant_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS notification_suppressions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  address         VARCHAR(255) NOT NULL,
  channel         notification_channel NOT NULL,
  reason          VARCHAR(80) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_suppression_unique UNIQUE (tenant_id, address, channel)
);

-- Field devices + paper bulk
CREATE TABLE IF NOT EXISTS field_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  device_id       VARCHAR(80) NOT NULL,
  user_id         UUID REFERENCES users(id),
  label           VARCHAR(120),
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  last_seen_at    TIMESTAMPTZ,
  wipe_requested_at TIMESTAMPTZ,
  wiped_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT field_devices_unique UNIQUE (tenant_id, device_id),
  CONSTRAINT field_devices_status_valid CHECK (status IN
    ('active','revoked','wipe_pending','wiped'))
);

CREATE TABLE IF NOT EXISTS paper_bulk_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  form_version_id UUID NOT NULL REFERENCES form_template_versions(id),
  label           VARCHAR(200) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'open',
  created_by      UUID,
  committed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT paper_batch_status_valid CHECK (status IN ('open','committed','cancelled'))
);

CREATE TABLE IF NOT EXISTS paper_bulk_rows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID NOT NULL REFERENCES paper_bulk_batches(id) ON DELETE CASCADE,
  paper_serial    VARCHAR(80) NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  beneficiary_id  UUID REFERENCES beneficiaries(id),
  submission_id   UUID REFERENCES submissions(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT paper_serial_unique UNIQUE (tenant_id, paper_serial)
);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS provenance VARCHAR(20) NOT NULL DEFAULT 'digital';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS clock_skew_flagged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_provenance_valid;
ALTER TABLE submissions ADD CONSTRAINT submissions_provenance_valid
  CHECK (provenance IN ('digital','paper'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'courses','course_versions','modules','lessons','assessments','questions','answer_options',
    'mandatory_training_rules','lms_enrollments','lesson_progress','assessment_attempts','certificates',
    'notification_templates','notification_preferences','notification_deliveries','notification_suppressions',
    'field_devices','paper_bulk_batches','paper_bulk_rows'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant ON %I
         USING (
           tenant_id IS NULL
           OR tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid
         )
         WITH CHECK (
           tenant_id IS NULL
           OR tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid
         )',
      t, t
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  courses, course_versions, modules, lessons, assessments, questions, answer_options,
  mandatory_training_rules, lms_enrollments, lesson_progress, assessment_attempts, certificates,
  notification_templates, notification_preferences, notification_deliveries, notification_suppressions,
  field_devices, paper_bulk_batches, paper_bulk_rows
TO ngois_app;
