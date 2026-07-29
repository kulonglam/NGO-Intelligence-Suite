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

  await client.query(
    `INSERT INTO tenants (id, slug, name, status, primary_country, created_at, updated_at)
     VALUES ($1, 'design-partner', 'Design Partner NGO', 'active', 'SS', now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [tenantId],
  );

  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
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
