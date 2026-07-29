/**
 * Gate: every table with a tenant_id column has RLS enabled and forced;
 * service role ngois_app must not bypass RLS.
 *
 * Usage: DATABASE_URL=... node scripts/verify-rls.mjs
 */
import pg from 'pg';

/** Known tenant-owned tables that must exist (Phase 1 catalogue). */
const REQUIRED_TABLES = [
  'users',
  'grants',
  'outbox',
  'grant_budgets',
  'budget_lines',
  'disbursements',
  'file_objects',
  'audit_events',
  'tenant_data_keys',
];

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgres://ngois:ngois_dev@127.0.0.1:5433/ngois';
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const discovered = await client.query(
    `SELECT c.relname
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname`,
  );
  const tables = [...new Set([...REQUIRED_TABLES, ...discovered.rows.map((r) => r.relname)])];

  const result = await client.query(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relname = ANY($1::text[])`,
    [tables],
  );

  const byName = new Map(result.rows.map((r) => [r.relname, r]));
  let failed = false;
  for (const table of tables) {
    const row = byName.get(table);
    if (!row) {
      console.error(`MISSING ${table}`);
      failed = true;
      continue;
    }
    if (!row.relrowsecurity || !row.relforcerowsecurity) {
      console.error(
        `FAIL ${table} rls=${row.relrowsecurity} force=${row.relforcerowsecurity}`,
      );
      failed = true;
    } else {
      console.log(`OK   ${table}`);
    }
  }

  const bypass = await client.query(
    `SELECT rolname FROM pg_roles
     WHERE rolname IN ('ngois_app') AND (rolsuper OR rolbypassrls)`,
  );
  if (bypass.rows.length) {
    failed = true;
    for (const r of bypass.rows) console.error(`FAIL role ${r.rolname} bypasses RLS`);
  } else {
    console.log('OK   ngois_app has no bypassrls/superuser');
  }

  await client.end();
  if (failed) process.exit(1);
  console.log(`verify-rls: ${tables.length} tenant tables OK`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
