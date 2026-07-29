import type pg from 'pg';
import { AppError, notFound } from '@ngois/errors';

export function payrollSchemaFromSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, '_').replace(/ /g, '_').toLowerCase()}`;
}

export async function resolvePayrollSchema(
  client: pg.PoolClient,
  tenantId: string,
): Promise<string> {
  const r = await client.query<{ payroll_schema: string | null; slug: string }>(
    `SELECT t.payroll_schema, t.slug FROM tenants t WHERE t.id = $1`,
    [tenantId],
  );
  const row = r.rows[0];
  if (!row) throw notFound('tenant', tenantId);
  if (row.payroll_schema) return row.payroll_schema;
  throw new AppError({
    code: 'NGOIS-PAY-0101',
    message: 'Payroll schema not provisioned for tenant.',
    statusCode: 409,
  });
}

/** Set svc_hr_payroll role + search_path for tenant payroll tables (ADR-0006). */
export async function withPayrollSchema<T>(
  client: pg.PoolClient,
  schema: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query(`SET LOCAL ROLE svc_hr_payroll`);
  await client.query(`SET LOCAL search_path = ${quoteIdent(schema)}, public`);
  try {
    return await fn();
  } finally {
    try {
      await client.query(`RESET ROLE`);
      await client.query(`SET LOCAL search_path = public`);
    } catch {
      /* transaction may already be aborted — preserve original error */
    }
  }
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new AppError({
      code: 'NGOIS-PAY-0102',
      message: 'Invalid payroll schema name.',
      statusCode: 500,
    });
  }
  return name;
}
