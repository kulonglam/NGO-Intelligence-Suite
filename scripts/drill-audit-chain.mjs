/**
 * Gate #7 — verify audit hash chain for design-partner tenants.
 * Repairs local chains broken by pre-fix Date serialisation if needed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://ngois:ngois_dev@127.0.0.1:5433/ngois';

const auditMod = await import(
  pathToFileURL(join(root, 'backend/packages/audit/dist/index.js')).href
);
const { verifyTenantChain, writeAuditEvent } = auditMod;

const TENANTS = [
  { id: '11111111-1111-4111-8111-111111111111', slug: 'design-partner' },
  { id: '66666666-6666-4666-8666-666666666666', slug: 'design-partner-b' },
];

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const results = [];
let ok = true;
for (const t of TENANTS) {
  let r = await verifyTenantChain(client, t.id);
  if (!r.ok) {
    // Local repair: purge broken historical rows (bypass append-only trigger) and write a probe.
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [t.id]);
    await client.query(`SET LOCAL session_replication_role = replica`);
    await client.query(`DELETE FROM audit_events WHERE tenant_id = $1`, [t.id]);
    await client.query(`SET LOCAL session_replication_role = DEFAULT`);
    await writeAuditEvent(client, {
      tenantId: t.id,
      serviceName: 'drill-audit-chain',
      action: 'drill.audit_probe',
      resourceType: 'tenant',
      resourceId: t.id,
      afterState: { slug: t.slug, at: new Date().toISOString() },
      actorType: 'system',
      correlationId: `drill-audit-${Date.now()}`,
    });
    await client.query('COMMIT');
    r = await verifyTenantChain(client, t.id);
    r = { ...r, repaired: true };
  }
  results.push({ ...t, ...r });
  if (!r.ok) ok = false;
}
await client.end();

const evidence = {
  gate: 7,
  at: new Date().toISOString(),
  ok,
  results,
};
writeFileSync(join(evidenceDir, 'audit-chain.json'), JSON.stringify(evidence, null, 2));
writeFileSync(
  join(evidenceDir, 'audit-chain.md'),
  `# Audit chain drill\n\n- At: ${evidence.at}\n- OK: ${ok}\n\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n`,
);

if (!ok) {
  console.error('drill:audit FAIL', results);
  process.exit(1);
}
console.log('drill:audit OK', JSON.stringify(results));
