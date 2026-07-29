/**
 * Ensure ngois_app has privileges from 003_data_foundation.sql
 * (safe to re-run; idempotent GRANTs).
 */
import pg from 'pg';

const url = process.env.DATABASE_URL ?? 'postgres://ngois:ngois_dev@127.0.0.1:5433/ngois';
const client = new pg.Client({ connectionString: url });
await client.connect();

const before = await client.query(
  `SELECT has_table_privilege('ngois_app','audit_events','INSERT') AS ins,
          has_table_privilege('ngois_app','audit_events','SELECT') AS sel`,
);
console.log('before', before.rows[0]);

await client.query(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON grant_budgets, budget_lines, disbursements, file_objects TO ngois_app',
);
await client.query('GRANT SELECT, INSERT ON audit_events TO ngois_app');
await client.query('REVOKE UPDATE, DELETE ON audit_events FROM ngois_app');
await client.query('GRANT SELECT, INSERT, UPDATE ON tenant_data_keys TO ngois_app');
await client.query('GRANT SELECT, INSERT, UPDATE ON outbox TO ngois_app');

const after = await client.query(
  `SELECT has_table_privilege('ngois_app','audit_events','INSERT') AS ins,
          has_table_privilege('ngois_app','disbursements','INSERT') AS disb`,
);
console.log('after', after.rows[0]);
await client.end();
