import type pg from 'pg';
import { AppError } from '@ngois/errors';

export type TenantContext = {
  tenantId: string;
  userId: string;
  role: string;
  permissions: string[];
  correlationId: string;
};

/**
 * Bind RLS session variable for the duration of the current transaction.
 * MUST use SET LOCAL — never SET — so the binding cannot leak across pooled connections.
 */
export async function setTenantLocal(client: pg.PoolClient, tenantId: string): Promise<void> {
  if (!tenantId) {
    throw new AppError({
      code: 'NGOIS-TEN-0001',
      message: 'Tenant context is required.',
      statusCode: 400,
    });
  }
  await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

export async function withTenant<T>(
  pool: pg.Pool,
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantLocal(client, tenantId);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function requireTenantId(value: string | undefined): string {
  if (!value) {
    throw new AppError({
      code: 'NGOIS-TEN-0001',
      message: 'X-Tenant-ID header is required.',
      statusCode: 400,
    });
  }
  return value;
}

export { isTenantRedisKey, tenantRedisKey } from './redis-key.js';
