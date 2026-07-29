/**
 * Provision tenant_<slug> payroll schema (ADR-0006).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(root, 'backend/db/migrations/templates/payroll_schema.sql');

export function payrollSchemaName(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return `tenant_${safe}`;
}

export async function provisionPayrollSchema(
  client: pg.Client | pg.PoolClient,
  tenantId: string,
  slug: string,
): Promise<string> {
  const schema = payrollSchemaName(slug);
  const template = readFileSync(templatePath, 'utf8');
  const sql = template.replaceAll('{{SCHEMA}}', schema).replaceAll('{{TENANT_ID}}', tenantId);
  await client.query(sql);
  return schema;
}
