import pg from 'pg';
import { createHash } from 'node:crypto';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'postgres://ngois:ngois_dev@127.0.0.1:5432/ngois';
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const financeUserId = '22222222-2222-4222-8222-222222222233';
  const hrUserId = '22222222-2222-4222-8222-222222222244';
  const grantId = '33333333-3333-4333-8333-333333333333';
  const passwordHash = createHash('sha256').update('changeme').digest('hex');

  const MODULE_IDS = [
    'grants',
    'reports',
    'finance',
    'hr',
    'payroll',
    'field',
    'lms',
    'notifications',
    'intelligence',
    'ai',
    'compliance',
    'integrations',
  ];
  const FEATURE_FLAGS = ['ai_insights', 'webhooks'];

  async function seedRuntimeConfig(tid: string) {
    for (const moduleId of MODULE_IDS) {
      await client.query(
        `INSERT INTO tenant_module_entitlements (tenant_id, module_id, enabled)
         VALUES ($1, $2, true)
         ON CONFLICT (tenant_id, module_id) DO NOTHING`,
        [tid, moduleId],
      );
    }
    for (const flag of FEATURE_FLAGS) {
      await client.query(
        `INSERT INTO tenant_feature_flags (tenant_id, flag_key, enabled)
         VALUES ($1, $2, true)
         ON CONFLICT (tenant_id, flag_key) DO NOTHING`,
        [tid, flag],
      );
    }
  }

  await client.query(
    `INSERT INTO tenants (id, slug, name, status, primary_country, created_at, updated_at)
     VALUES ($1, 'design-partner', 'Design Partner NGO', 'active', 'SS', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [tenantId],
  );

  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await seedRuntimeConfig(tenantId);
    await client.query(
      `INSERT INTO users (id, tenant_id, email, display_name, role, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, 'admin@design-partner.example', 'Design Partner Admin', 'org_admin', $3, 'active', now(), now())
       ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash`,
      [userId, tenantId, passwordHash],
    );
    await client.query(
      `INSERT INTO users (id, tenant_id, email, display_name, role, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, 'finance@design-partner.example', 'Design Partner Finance', 'finance_manager', $3, 'active', now(), now())
       ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash`,
      [financeUserId, tenantId, passwordHash],
    );
    await client.query(
      `INSERT INTO users (id, tenant_id, email, display_name, role, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, 'hr@design-partner.example', 'Design Partner HR', 'hr_manager', $3, 'active', now(), now())
       ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash`,
      [hrUserId, tenantId, passwordHash],
    );

    await client.query(
      `INSERT INTO grants (
         id, tenant_id, grant_number, title, donor_name, currency, total_budget,
         status, start_date, end_date, created_at, updated_at, version
       ) VALUES (
         $1, $2, 'SSD-2026-001', 'Emergency WASH Response', 'FCDO', 'USD', 2500000.00,
         'active', '2026-01-01', '2026-12-31', now(), now(), 1
       ) ON CONFLICT (tenant_id, grant_number) DO NOTHING`,
      [grantId, tenantId],
    );
    await client.query(
      `INSERT INTO grant_budgets (
         tenant_id, grant_id, version_number, is_current, total_budgeted, currency
       )
       SELECT $1, $2, 1, true, 2500000.00, 'USD'
       WHERE NOT EXISTS (
         SELECT 1 FROM grant_budgets WHERE grant_id = $2 AND is_current AND NOT is_deleted
       )`,
      [tenantId, grantId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  // Second tenant to prove isolation in tests later
  const tenant2 = '44444444-4444-4444-8444-444444444444';
  const grant2Id = '55555555-5555-4555-8555-555555555555';
  await client.query(
    `INSERT INTO tenants (id, slug, name, status, primary_country, created_at, updated_at)
     VALUES ($1, 'other-ngo', 'Other NGO', 'active', 'UG', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [tenant2],
  );

  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant2]);
    await client.query(
      `INSERT INTO grants (
         id, tenant_id, grant_number, title, donor_name, currency, total_budget,
         status, start_date, end_date, created_at, updated_at, version
       ) VALUES (
         $1, $2, 'UGA-2026-001', 'Should never be visible to design-partner', 'USAID', 'USD', 100000.00,
         'active', '2026-01-01', '2026-12-31', now(), now(), 1
       ) ON CONFLICT (tenant_id, grant_number) DO NOTHING`,
      [grant2Id, tenant2],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  // Second design-partner tenant (Phase 1 gate #17 / RB-05)
  const partnerB = '66666666-6666-4666-8666-666666666666';
  const partnerBUser = '77777777-7777-4777-8777-777777777777';
  const partnerBGrant = '88888888-8888-4888-8888-888888888888';
  await client.query(
    `INSERT INTO tenants (id, slug, name, status, primary_country, created_at, updated_at)
     VALUES ($1, 'design-partner-b', 'Design Partner B NGO', 'active', 'KE', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [partnerB],
  );
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [partnerB]);
    await client.query(
      `INSERT INTO users (id, tenant_id, email, display_name, role, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, 'admin@design-partner-b.example', 'Design Partner B Admin', 'org_admin', $3, 'active', now(), now())
       ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash`,
      [partnerBUser, partnerB, passwordHash],
    );
    await client.query(
      `INSERT INTO grants (
         id, tenant_id, grant_number, title, donor_name, currency, total_budget,
         status, start_date, end_date, created_at, updated_at, version
       ) VALUES (
         $1, $2, 'KEN-2026-001', 'Partner B Nutrition', 'WFP', 'USD', 500000.00,
         'active', '2026-01-01', '2026-12-31', now(), now(), 1
       ) ON CONFLICT (tenant_id, grant_number) DO NOTHING`,
      [partnerBGrant, partnerB],
    );
    await client.query(
      `INSERT INTO grant_budgets (
         tenant_id, grant_id, version_number, is_current, total_budgeted, currency
       )
       SELECT $1, $2, 1, true, 500000.00, 'USD'
       WHERE NOT EXISTS (
         SELECT 1 FROM grant_budgets WHERE grant_id = $2 AND is_current AND NOT is_deleted
       )`,
      [partnerB, partnerBGrant],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  // Phase 2 workforce — HR dept, SS employee (Appendix I fixture), payroll schema
  await client.query(`SELECT provision_tenant_payroll_schema($1, 'design-partner')`, [tenantId]);
  const deptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const empId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const contractId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await client.query(
      `INSERT INTO departments (id, tenant_id, code, name, cost_centre)
       VALUES ($1, $2, 'PROG', 'Programmes', 'CC-001')
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [deptId, tenantId],
    );
    const seedCipher = Buffer.from('seed-placeholder');
    await client.query(
      `INSERT INTO employees (
         id, tenant_id, employee_number, first_name_encrypted, last_name_encrypted,
         display_name, name_blind_index, payroll_country, status, hire_date, department_id
       ) VALUES ($1, $2, 'EMP-001', $4, $4,
         'Jane Example (SS fixture)', 'seed-index', 'SS', 'active', '2026-01-01', $3)
       ON CONFLICT (tenant_id, employee_number) DO NOTHING`,
      [empId, tenantId, deptId, seedCipher],
    );
    await client.query(
      `INSERT INTO contracts (
         id, tenant_id, employee_id, contract_number, start_date, gross_salary, salary_currency,
         status, allowances
       ) VALUES (
         $1, $2, $3, 'CON-001', '2026-01-01', 40000.00, 'SSP', 'active',
         $4::jsonb
       ) ON CONFLICT (tenant_id, contract_number) DO NOTHING`,
      [
        contractId,
        tenantId,
        empId,
        JSON.stringify([
          { code: 'HOUSING', amount: '8000.00', taxable: true, pensionable: true },
          { code: 'TRANSPORT', amount: '3000.00', taxable: false, pensionable: false },
        ]),
      ],
    );
    await client.query(
      `INSERT INTO leave_types (tenant_id, code, name, accrual_days, is_paid)
       VALUES ($1, 'ANNUAL', 'Annual leave', 21, true)
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [tenantId],
    );
    const positionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await client.query(
      `INSERT INTO positions (id, tenant_id, department_id, title, grade, is_supervisory)
       VALUES ($1, $2, $3, 'Programme Officer', 'G6', false)
       ON CONFLICT (id) DO NOTHING`,
      [positionId, tenantId, deptId],
    );
    await client.query(
      `INSERT INTO onboarding_templates (tenant_id, code, name, task_defs)
       VALUES ($1, 'DEFAULT', 'Standard staff onboarding', $2::jsonb)
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [
        tenantId,
        JSON.stringify([
          { code: 'CONTRACT', title: 'Signed contract on file', sort_order: 1 },
          { code: 'BANK', title: 'Bank details collected', sort_order: 2 },
          { code: 'ID', title: 'ID document verified', sort_order: 3 },
        ]),
      ],
    );
    await client.query(
      `INSERT INTO tenant_quotas (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO chart_of_accounts (tenant_id, account_code, name, account_type)
       VALUES ($1, '5100', 'Programme expenses', 'expense')
       ON CONFLICT (tenant_id, account_code) DO NOTHING`,
      [tenantId],
    );

    // Phase 3 — programme + published registration form
    const programmeId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const formId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const formVersionId = 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0';
    await client.query(
      `INSERT INTO programmes (id, tenant_id, code, name, status)
       VALUES ($1, $2, 'WASH-REG', 'WASH household registration', 'active')
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [programmeId, tenantId],
    );
    await client.query(
      `INSERT INTO form_templates (id, tenant_id, code, title, status)
       VALUES ($1, $2, 'HH-REG', 'Household registration', 'published')
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [formId, tenantId],
    );
    await client.query(
      `INSERT INTO form_template_versions (
         id, tenant_id, form_template_id, version_number, definition, published_at, is_current
       ) VALUES ($1, $2, $3, 1, '{"title":"Household registration"}'::jsonb, now(), true)
       ON CONFLICT (tenant_id, form_template_id, version_number) DO NOTHING`,
      [formVersionId, tenantId, formId],
    );
    await client.query(
      `INSERT INTO form_fields (tenant_id, form_version_id, field_key, label, field_type, required, sort_order)
       SELECT $1, $2, x.field_key, x.label, x.field_type, x.required, x.sort_order
       FROM (VALUES
         ('household_size', 'Household size', 'number', true, 1),
         ('settlement', 'Settlement', 'text', true, 2),
         ('notes', 'Notes', 'text', false, 3)
       ) AS x(field_key, label, field_type, required, sort_order)
       WHERE NOT EXISTS (
         SELECT 1 FROM form_fields f WHERE f.form_version_id = $2 AND f.field_key = x.field_key
       )`,
      [tenantId, formVersionId],
    );
    await client.query(
      `INSERT INTO form_assignments (tenant_id, form_template_id)
       SELECT $1, $2
       WHERE NOT EXISTS (
         SELECT 1 FROM form_assignments WHERE tenant_id = $1 AND form_template_id = $2 AND user_id IS NULL
       )`,
      [tenantId, formId],
    );

    // Phase 3 full — safeguarding LMS course + notification templates
    const courseId = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';
    const courseVersionId = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
    const moduleId = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';
    const lessonId = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
    const assessmentId = 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4';
    const questionId = 'c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5';
    const optTrueId = 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6';
    const optFalseId = 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7';
    await client.query(
      `INSERT INTO courses (id, tenant_id, code, title, category, is_mandatory_default, current_version_id)
       VALUES ($1,$2,'SAFEGUARD-101','Safeguarding fundamentals','safeguarding',true,$3)
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [courseId, tenantId, courseVersionId],
    );
    await client.query(
      `INSERT INTO course_versions (
         id, tenant_id, course_id, version_number, title, description,
         pass_threshold_percent, is_published, published_at
       ) VALUES ($1,$2,$3,1,'Safeguarding fundamentals','Mandatory for all staff',80,true,now())
       ON CONFLICT (course_id, version_number) DO NOTHING`,
      [courseVersionId, tenantId, courseId],
    );
    await client.query(
      `UPDATE courses SET current_version_id = $1 WHERE id = $2 AND current_version_id IS NULL`,
      [courseVersionId, courseId],
    );
    await client.query(
      `INSERT INTO modules (id, tenant_id, course_version_id, title, display_order)
       VALUES ($1,$2,$3,'Core principles',1)
       ON CONFLICT (course_version_id, display_order) DO NOTHING`,
      [moduleId, tenantId, courseVersionId],
    );
    await client.query(
      `INSERT INTO lessons (id, tenant_id, module_id, title, content_type, content_body, display_order)
       VALUES ($1,$2,$3,'Report promptly','text','Escalate safeguarding concerns immediately.',1)
       ON CONFLICT (module_id, display_order) DO NOTHING`,
      [lessonId, tenantId, moduleId],
    );
    await client.query(
      `INSERT INTO assessments (id, tenant_id, course_version_id, title, pass_threshold_percent, max_attempts)
       SELECT $1,$2,$3,'Safeguarding check',80,3
       WHERE NOT EXISTS (SELECT 1 FROM assessments WHERE id = $1)`,
      [assessmentId, tenantId, courseVersionId],
    );
    await client.query(
      `INSERT INTO questions (id, tenant_id, assessment_id, question_text, question_type, display_order)
       SELECT $1,$2,$3,'Safeguarding reports must be escalated promptly.','true_false',1
       WHERE NOT EXISTS (SELECT 1 FROM questions WHERE id = $1)`,
      [questionId, tenantId, assessmentId],
    );
    await client.query(
      `INSERT INTO answer_options (id, tenant_id, question_id, option_text, is_correct, display_order)
       SELECT $1,$2,$3,'True',true,1
       WHERE NOT EXISTS (SELECT 1 FROM answer_options WHERE id = $1)`,
      [optTrueId, tenantId, questionId],
    );
    await client.query(
      `INSERT INTO answer_options (id, tenant_id, question_id, option_text, is_correct, display_order)
       SELECT $1,$2,$3,'False',false,2
       WHERE NOT EXISTS (SELECT 1 FROM answer_options WHERE id = $1)`,
      [optFalseId, tenantId, questionId],
    );
    await client.query(
      `INSERT INTO mandatory_training_rules (tenant_id, course_id, applies_to_type, due_days_after_hire)
       SELECT $1,$2,'all_staff',30
       WHERE NOT EXISTS (
         SELECT 1 FROM mandatory_training_rules WHERE tenant_id = $1 AND course_id = $2 AND applies_to_type = 'all_staff'
       )`,
      [tenantId, courseId],
    );

    const templates: Array<[string, string, string | null, string, string, boolean]> = [
      [
        'payslip_ready',
        'email',
        'Your payslip is ready',
        'Your payslip is ready. Open the secure link in the app — no figures in email.',
        'payroll',
        true,
      ],
      [
        'payslip_ready',
        'sms',
        null,
        'Payslip ready. Open NGOIS app ref {{ref}}',
        'payroll',
        true,
      ],
      [
        'lms_enrollment',
        'email',
        'Training assigned: {{course}}',
        'You have been enrolled in {{course}}. Complete by {{due_date}}.',
        'lms',
        false,
      ],
      [
        'lms_enrollment',
        'sms',
        null,
        'Training assigned. Open NGOIS app. Due {{due_date}}',
        'lms',
        true,
      ],
      [
        'sync_alert',
        'email',
        'Field sync alert',
        'Sync issues detected for your organisation. See RB-16.',
        'field',
        true,
      ],
      [
        'sync_alert',
        'sms',
        null,
        'NGOIS sync alert. Check with supervisor. Ref {{ref}}',
        'field',
        true,
      ],
    ];
    for (const [code, channel, subject, body, category, critical] of templates) {
      await client.query(
        `INSERT INTO notification_templates (
           tenant_id, code, channel, subject, body_template, category, is_critical, allows_pii
         ) VALUES ($1,$2,$3::notification_channel,$4,$5,$6,$7,false)
         ON CONFLICT (tenant_id, code, channel, locale) DO NOTHING`,
        [tenantId, code, channel, subject, body, category, critical],
      );
    }

    // Phase 4 — analytics / AI / IATI seed
    await client.query(
      `UPDATE grants SET iati_eligible = true, admin_area_l2 = 'Unity'
       WHERE id = $1`,
      [grantId],
    );
    await client.query(
      `INSERT INTO kpi_definitions (tenant_id, code, title, unit) VALUES
         ($1, 'grants_active', 'Active grants', 'count'),
         ($1, 'beneficiaries_registered', 'Beneficiaries registered', 'count'),
         ($1, 'field_submissions', 'Field submissions', 'count')
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO dashboard_configs (tenant_id, code, title, panels)
       VALUES ($1, 'exec', 'Executive intelligence',
         '[{"kpi":"grants_active"},{"kpi":"beneficiaries_registered"},{"kpi":"field_submissions"}]'::jsonb)
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO indicator_definitions (tenant_id, code, title)
       VALUES ($1, 'HH_REACHED', 'Households reached')
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO indicator_values (tenant_id, indicator_code, period, value_numeric, disaggregation)
       VALUES ($1, 'HH_REACHED', '2026-Q1', 800, '{"admin2":"Rubkona"}'::jsonb)`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO tenant_ai_settings (tenant_id, ai_enabled, monthly_token_budget)
       VALUES ($1, true, 100000)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO ai_prompts (tenant_id, code, version, template, is_current)
       VALUES ($1, 'grant_narrative_v1', '1',
         'Write a short donor narrative from these aggregates only:\n{{context}}', true)
       ON CONFLICT (tenant_id, code, version) DO NOTHING`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO kpi_snapshots (tenant_id, kpi_code, value_numeric, meta)
       VALUES
         ($1, 'grants_active', 1, '{"seed":true}'::jsonb),
         ($1, 'beneficiaries_registered', 0, '{"seed":true}'::jsonb),
         ($1, 'field_submissions', 0, '{"seed":true}'::jsonb)`,
      [tenantId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  // Phase 2 gate #12 — synthetic tenants 3–8 (RB-05 loop, no manual steps)
  for (let n = 3; n <= 8; n++) {
    const id = `99999999-9999-4999-8999-99999999999${n}`;
    const slug = `synthetic-tenant-${n}`;
    const adminId = `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${n}`;
    await client.query(
      `INSERT INTO tenants (id, slug, name, status, primary_country, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', 'SS', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [id, slug, `Synthetic Tenant ${n}`],
    );
    await client.query('BEGIN');
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [id]);
      await seedRuntimeConfig(id);
      await client.query(
        `INSERT INTO users (id, tenant_id, email, display_name, role, password_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'org_admin', $5, 'active', now(), now())
         ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [adminId, id, `admin@${slug}.example`, `Synthetic ${n} Admin`, passwordHash],
      );
      await client.query(
        `INSERT INTO tenant_quotas (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
        [id],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    await client.query(`SELECT provision_tenant_payroll_schema($1, $2)`, [id, slug]);
  }
  await client.query(
    `INSERT INTO tenant_quotas (tenant_id)
     SELECT id FROM tenants t
     WHERE NOT EXISTS (SELECT 1 FROM tenant_quotas q WHERE q.tenant_id = t.id)`,
  );

  await client.end();
  console.log('seed complete');
  console.log('  tenant: design-partner');
  console.log('  user:   admin@design-partner.example / changeme  (org_admin)');
  console.log('  user:   finance@design-partner.example / changeme  (finance_manager)');
  console.log('  user:   hr@design-partner.example / changeme  (hr_manager)');
  console.log('  tenant: design-partner-b');
  console.log('  user:   admin@design-partner-b.example / changeme  (org_admin)');
  console.log('  tenants: synthetic-tenant-3 … synthetic-tenant-8 (gate #12)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
