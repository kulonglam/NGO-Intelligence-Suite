/**
 * Monthly leave accrual for all tenants (or one via TENANT_ID).
 * Usage: node scripts/leave-accrual.mjs
 */
import pg from 'pg';

const url =
  process.env.DATABASE_URL ?? 'postgres://ngois_app:ngois_app_dev@127.0.0.1:5433/ngois';
const pool = new pg.Pool({ connectionString: url });
const now = new Date();
const year = Number(process.env.ACCRUAL_YEAR ?? now.getFullYear());
const month = Number(process.env.ACCRUAL_MONTH ?? now.getMonth() + 1);

const tenants = await pool.query<{ id: string; slug: string }>(
  process.env.TENANT_ID
    ? `SELECT id, slug FROM tenants WHERE id = $1 AND deleted_at IS NULL`
    : `SELECT id, slug FROM tenants WHERE deleted_at IS NULL ORDER BY slug`,
  process.env.TENANT_ID ? [process.env.TENANT_ID] : [],
);

for (const t of tenants.rows) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [t.id]);
    const exists = await client.query(
      `SELECT 1 FROM leave_accrual_runs WHERE tenant_id=$1 AND period_year=$2 AND period_month=$3`,
      [t.id, year, month],
    );
    if (exists.rowCount) {
      console.log(`skip ${t.slug} ${year}-${month}`);
      await client.query('ROLLBACK');
      continue;
    }
    const run = await client.query(
      `INSERT INTO leave_accrual_runs (tenant_id, period_year, period_month)
       VALUES ($1,$2,$3) RETURNING id`,
      [t.id, year, month],
    );
    const types = await client.query(`SELECT id, accrual_days::text FROM leave_types`);
    const emps = await client.query(
      `SELECT id FROM employees WHERE status IN ('active','on_leave') AND NOT is_deleted`,
    );
    let lines = 0;
    for (const emp of emps.rows) {
      for (const lt of types.rows) {
        const monthly = (Number(lt.accrual_days) / 12).toFixed(2);
        if (Number(monthly) <= 0) continue;
        await client.query(
          `INSERT INTO leave_balances (tenant_id, employee_id, leave_type_id, accrued_days, taken_days)
           VALUES ($1,$2,$3,$4,0)
           ON CONFLICT (tenant_id, employee_id, leave_type_id)
           DO UPDATE SET accrued_days = leave_balances.accrued_days + EXCLUDED.accrued_days,
                         updated_at = now()`,
          [t.id, emp.id, lt.id, monthly],
        );
        await client.query(
          `INSERT INTO leave_accrual_lines (tenant_id, accrual_run_id, employee_id, leave_type_id, days_accrued)
           VALUES ($1,$2,$3,$4,$5)`,
          [t.id, run.rows[0].id, emp.id, lt.id, monthly],
        );
        lines += 1;
      }
    }
    await client.query(`UPDATE leave_accrual_runs SET employees_accrued=$2 WHERE id=$1`, [
      run.rows[0].id,
      emps.rowCount ?? 0,
    ]);
    await client.query('COMMIT');
    console.log(`OK ${t.slug} lines=${lines}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`FAIL ${t.slug}`, e);
  } finally {
    client.release();
  }
}
await pool.end();
