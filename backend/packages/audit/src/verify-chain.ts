/**
 * Verify audit hash chains for all tenants (or DATABASE_URL tenant list).
 * Usage: DATABASE_URL=... npm run verify -w @ngois/audit
 */
import pg from 'pg';
import { setTenantLocal } from '@ngois/tenant-context';
import { verifyTenantChain } from './index.js';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'postgres://ngois:ngois_dev@127.0.0.1:5433/ngois';
  const pool = new pg.Pool({ connectionString: url });
  const tenants = await pool.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM tenants WHERE deleted_at IS NULL ORDER BY slug`,
  );

  let failed = false;
  for (const t of tenants.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setTenantLocal(client, t.id);
      const result = await verifyTenantChain(client, t.id);
      await client.query('COMMIT');
      if (result.ok) {
        console.log(`OK  ${t.slug}  checked=${result.checked}`);
      } else {
        failed = true;
        console.error(`FAIL ${t.slug}  breaks=${result.breaks.length}`);
        for (const b of result.breaks.slice(0, 5)) {
          console.error(`  seq=${b.sequence} expected=${b.expected} actual=${b.actual}`);
        }
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
