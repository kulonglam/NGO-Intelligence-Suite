/**
 * Provision tenant_<slug> payroll schemas for all active tenants.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(root, 'backend/db/migrations/templates/payroll_schema.sql');

function schemaName(slug) {
  return `tenant_${slug.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
}

const url = process.env.DATABASE_URL ?? 'postgres://ngois:ngois_dev@127.0.0.1:5433/ngois';
const client = new pg.Client({ connectionString: url });
await client.connect();

const template = readFileSync(templatePath, 'utf8');
const tenants = await client.query(`SELECT id, slug FROM tenants WHERE status = 'active' ORDER BY slug`);

for (const t of tenants.rows) {
  const schema = schemaName(t.slug);
  const sql = template.replaceAll('{{SCHEMA}}', schema).replaceAll('{{TENANT_ID}}', t.id);
  await client.query(sql);
  console.log(`OK   ${schema} for ${t.slug}`);
}

await client.end();
console.log('payroll schema provision complete');
