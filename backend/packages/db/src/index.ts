import pg from 'pg';

const { Pool } = pg;

export type Queryable = {
  query: pg.Pool['query'];
};

export function createPool(connectionString: string): pg.Pool {
  return new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });
}

/**
 * Run work inside a transaction. Prefer SET LOCAL for tenant context —
 * never SET without LOCAL (Semgrep gate / SDD 29).
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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

export { pg };
