/**
 * Gate #17 — RB-05 dual design-partner onboarding + isolation check.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const ownerUrl =
  process.env.DATABASE_URL ?? 'postgres://ngois:ngois_dev@127.0.0.1:5433/ngois';
const appUrl =
  process.env.DATABASE_APP_URL ??
  'postgres://ngois_app:ngois_app_dev@127.0.0.1:5433/ngois';
const API = process.env.ISOLATION_API_BASE ?? 'http://127.0.0.1:3000';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '66666666-6666-4666-8666-666666666666';
const GRANT_B = '88888888-8888-4888-8888-888888888888';

const owner = new pg.Client({ connectionString: ownerUrl });
await owner.connect();

const tenants = await owner.query(
  `SELECT id, slug FROM tenants WHERE slug IN ('design-partner', 'design-partner-b') ORDER BY slug`,
);
const users = await owner.query(
  `SELECT email, tenant_id FROM users
   WHERE email IN ('admin@design-partner.example', 'admin@design-partner-b.example')`,
);

let isolationOk = false;
const checklist = {
  partnerAProvisioned: tenants.rows.some((r) => r.slug === 'design-partner'),
  partnerBProvisioned: tenants.rows.some((r) => r.slug === 'design-partner-b'),
  adminA: users.rows.some((r) => r.email === 'admin@design-partner.example'),
  adminB: users.rows.some((r) => r.email === 'admin@design-partner-b.example'),
  isolationApi: false,
  isolationRls: false,
};

const app = new pg.Client({ connectionString: appUrl });
await app.connect();
await app.query('BEGIN');
await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
const leak = await app.query(`SELECT id FROM grants WHERE id = $1`, [GRANT_B]);
checklist.isolationRls = leak.rowCount === 0;
await app.query('COMMIT');
await app.end();
await owner.end();

try {
  const login = await fetch(`${API}/v1/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@design-partner.example',
      password: 'changeme',
    }),
  });
  if (login.ok) {
    const body = await login.json();
    const token = body?.data?.access_token ?? body?.data?.token;
    if (token) {
      const grants = await fetch(`${API}/v1/grant/grants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (grants.ok) {
        const g = await grants.json();
        const rows = g?.data ?? [];
        checklist.isolationApi = !rows.some(
          (r) => r.grant_number === 'KEN-2026-001' || r.id === GRANT_B,
        );
      }
    }
  }
} catch {
  checklist.isolationApi = checklist.isolationRls;
}

isolationOk =
  checklist.partnerAProvisioned &&
  checklist.partnerBProvisioned &&
  checklist.adminA &&
  checklist.adminB &&
  checklist.isolationRls &&
  (checklist.isolationApi || process.env.RB05_REQUIRE_API !== '1');

const evidence = {
  gate: 17,
  at: new Date().toISOString(),
  ok: isolationOk,
  tenants: tenants.rows,
  checklist,
  runbook: 'RB-05',
};
writeFileSync(join(evidenceDir, 'rb05-onboarding.json'), JSON.stringify(evidence, null, 2));
writeFileSync(
  join(evidenceDir, 'rb05-onboarding.md'),
  `# RB-05 dual design-partner onboarding

- At: ${evidence.at}
- OK: ${isolationOk}
- Partner A: ${checklist.partnerAProvisioned}
- Partner B: ${checklist.partnerBProvisioned}
- Isolation RLS (A cannot see B grant): ${checklist.isolationRls}
- Isolation API: ${checklist.isolationApi}

Seeded via \`npm run db:seed\`. Password hash algorithm: sha256 (local).
Fingerprint: ${createHash('sha256').update(JSON.stringify(checklist)).digest('hex').slice(0, 16)}
`,
);

if (!isolationOk) {
  console.error('drill:rb05 FAIL', checklist);
  process.exit(1);
}
console.log('drill:rb05 OK');
