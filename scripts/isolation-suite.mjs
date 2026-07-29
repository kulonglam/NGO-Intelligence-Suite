/**
 * Tenant isolation suite — SDD §23.9 (15 categories).
 * Never skip / pending when ISOLATION_REQUIRE_API=1 (CI).
 *
 * Env:
 *   DATABASE_URL          owner URL (role / catalogue checks)
 *   DATABASE_APP_URL      ngois_app URL (RLS checks)
 *   ISOLATION_API_BASE    default http://127.0.0.1:3000
 *   ISOLATION_REQUIRE_API=1  fail if gateway is down
 */
import { createHash, randomUUID } from 'node:crypto';
import { basename, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const OWNER_URL =
  process.env.DATABASE_URL ?? 'postgres://ngois:ngois_dev@127.0.0.1:5433/ngois';
const APP_URL =
  process.env.DATABASE_APP_URL ??
  'postgres://ngois_app:ngois_app_dev@127.0.0.1:5433/ngois';
const API_BASE = process.env.ISOLATION_API_BASE ?? 'http://127.0.0.1:3000';
const REQUIRE_API = process.env.ISOLATION_REQUIRE_API === '1';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '44444444-4444-4444-8444-444444444444';
const GRANT_B = '55555555-5555-4555-8555-555555555555';

async function withClient(url, fn) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function apiAvailable() {
  try {
    const res = await fetch(`${API_BASE}/v1/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function login(email) {
  const res = await fetch(`${API_BASE}/v1/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password: 'changeme' }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(`login failed for ${email}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data.access_token;
}

function safeFilename(name) {
  return basename(name).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180) || 'file';
}

function tenantStorageKey(tenantId, originalName) {
  return `${tenantId}/2026/07/${randomUUID()}-${safeFilename(originalName)}`;
}

async function loadRedisHelpers() {
  const href = pathToFileURL(
    join(process.cwd(), 'backend/packages/tenant-context/dist/redis-key.js'),
  ).href;
  return import(href);
}

/** @type {Array<{ id: string, name: string, needsApi?: boolean, run: (ctx: { apiUp: boolean }) => Promise<string | void> }>} */
const CATEGORIES = [
  {
    id: 'ISO-01',
    name: 'RLS enabled+forced on every tenant_id table',
    async run() {
      return withClient(OWNER_URL, async (client) => {
        const tables = await client.query(
          `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
           WHERE n.nspname = 'public' AND c.relkind = 'r'`,
        );
        if (!tables.rows.length) throw new Error('no tenant_id tables found');
        const bad = tables.rows.filter((r) => !r.relrowsecurity || !r.relforcerowsecurity);
        if (bad.length) {
          throw new Error(
            bad
              .map((r) => `${r.relname} rls=${r.relrowsecurity} force=${r.relforcerowsecurity}`)
              .join('; '),
          );
        }
        return `${tables.rows.length} tables`;
      });
    },
  },
  {
    id: 'ISO-02',
    name: 'Direct query under A cannot return B rows',
    async run() {
      return withClient(APP_URL, async (client) => {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
        const byId = await client.query(`SELECT id FROM grants WHERE id = $1`, [GRANT_B]);
        const byWhere = await client.query(`SELECT id FROM grants WHERE tenant_id = $1`, [
          TENANT_B,
        ]);
        await client.query('ROLLBACK');
        if (byId.rows.length || byWhere.rows.length) {
          throw new Error(`leaked ${byId.rows.length + byWhere.rows.length} row(s)`);
        }
      });
    },
  },
  {
    id: 'ISO-03',
    name: 'Missing tenant context returns zero rows',
    async run() {
      return withClient(APP_URL, async (client) => {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', '', true)`);
        const r = await client.query(`SELECT count(*)::int AS n FROM grants`);
        await client.query('ROLLBACK');
        if (r.rows[0].n !== 0) throw new Error(`expected 0, got ${r.rows[0].n}`);
      });
    },
  },
  {
    id: 'ISO-04',
    name: 'API cross-tenant grant id returns 404 (not 403)',
    needsApi: true,
    async run() {
      const token = await login('admin@design-partner.example');
      const res = await fetch(`${API_BASE}/v1/grant/grants/${GRANT_B}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (res.status === 403) throw new Error('got 403 — existence leak');
      if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
    },
  },
  {
    id: 'ISO-05',
    name: 'Token A cannot see B; forged X-Tenant-ID stripped',
    needsApi: true,
    async run() {
      const token = await login('admin@design-partner.example');
      const res = await fetch(`${API_BASE}/v1/grant/grants`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'X-Tenant-ID': TENANT_B,
        },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(`list failed: ${res.status}`);
      const leak = (json.data ?? []).filter(
        (g) => g.id === GRANT_B || g.grant_number === 'UGA-2026-001',
      );
      if (leak.length) throw new Error('forged header or list leaked tenant B');
    },
  },
  {
    id: 'ISO-06',
    name: 'Redis keys are tenant-prefixed',
    async run() {
      const mod = await loadRedisHelpers();
      const key = mod.tenantRedisKey(TENANT_A, 'cache', 'x');
      if (!key.startsWith(`ngois:${TENANT_A}:`)) throw new Error(`bad key ${key}`);
      if (mod.isTenantRedisKey(TENANT_B, key)) throw new Error('cross-tenant key accepted');
      let threw = false;
      try {
        mod.tenantRedisKey('not-uuid', 'x');
      } catch {
        threw = true;
      }
      if (!threw) throw new Error('accepted non-uuid tenant');
    },
  },
  {
    id: 'ISO-07',
    name: 'Redis cache keys differ per tenant',
    async run() {
      const mod = await loadRedisHelpers();
      const a = mod.tenantRedisKey(TENANT_A, 'report', 'summary');
      const b = mod.tenantRedisKey(TENANT_B, 'report', 'summary');
      if (a === b) throw new Error('identical keys across tenants');
      if (mod.isTenantRedisKey(TENANT_A, b)) throw new Error('A accepted B key');
    },
  },
  {
    id: 'ISO-08',
    name: 'Payroll schema isolation (tenant_* sealed)',
    async run() {
      return withClient(OWNER_URL, async (client) => {
        const schemas = await client.query(
          `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`,
        );
        if (!schemas.rows.length) return 'no tenant_* schemas yet';
        for (const { nspname } of schemas.rows) {
          const priv = await client.query(
            `SELECT has_schema_privilege('ngois_app', $1, 'USAGE') AS usage`,
            [nspname],
          );
          if (priv.rows[0].usage) throw new Error(`ngois_app has USAGE on ${nspname}`);
        }
        return `${schemas.rows.length} schemas sealed`;
      });
    },
  },
  {
    id: 'ISO-09',
    name: 'Object storage tenant-prefixed; foreign file → 404',
    needsApi: true,
    async run({ apiUp }) {
      const evil = tenantStorageKey(TENANT_A, '../../../etc/passwd');
      if (!evil.startsWith(`${TENANT_A}/`) || evil.includes('..')) {
        throw new Error(`unsafe key ${evil}`);
      }
      const abs = normalize(join('.data', 'files', evil));
      const root = normalize(join('.data', 'files', TENANT_A));
      if (!abs.startsWith(root + sep) && abs !== root) {
        throw new Error(`escapes tenant root: ${abs}`);
      }
      if (!apiUp) throw new Error('API required for cross-tenant file check');

      const foreignId = await withClient(OWNER_URL, async (client) => {
        const id = randomUUID();
        const key = `${TENANT_B}/2026/07/${id}-secret.txt`;
        await client.query(
          `INSERT INTO file_objects (
             id, tenant_id, storage_bucket, storage_key, original_filename, content_type,
             size_bytes, checksum_sha256, purpose, scan_status
           ) VALUES ($1,$2,'ngois-local',$3,'secret.txt','text/plain',4,$4,'grant_document','clean')
           ON CONFLICT (id) DO NOTHING`,
          [id, TENANT_B, key, createHash('sha256').update('x').digest('hex')],
        );
        return id;
      });
      const token = await login('admin@design-partner.example');
      const res = await fetch(`${API_BASE}/v1/file/objects/${foreignId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) throw new Error('got 403 — existence leak');
      if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
    },
  },
  {
    id: 'ISO-10',
    name: 'Outbox events carry tenant_id and are RLS-scoped',
    async run() {
      return withClient(OWNER_URL, async (owner) => {
        const nulls = await owner.query(
          `SELECT count(*)::int AS n FROM outbox WHERE tenant_id IS NULL`,
        );
        if (nulls.rows[0].n > 0) throw new Error(`${nulls.rows[0].n} rows missing tenant_id`);
        await withClient(APP_URL, async (app) => {
          await app.query('BEGIN');
          await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
          const foreign = await app.query(`SELECT id FROM outbox WHERE tenant_id = $1 LIMIT 5`, [
            TENANT_B,
          ]);
          await app.query('ROLLBACK');
          if (foreign.rows.length) throw new Error('outbox leaked tenant B under A');
        });
      });
    },
  },
  {
    id: 'ISO-11',
    name: 'Grant listing scoped to requesting tenant',
    needsApi: true,
    async run() {
      const token = await login('admin@design-partner.example');
      const res = await fetch(`${API_BASE}/v1/grant/grants`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const json = await res.json();
      if ((json.data ?? []).some((g) => g.grant_number === 'UGA-2026-001')) {
        throw new Error('list spanned tenants');
      }
    },
  },
  {
    id: 'ISO-12',
    name: 'File path traversal cannot escape tenant prefix',
    async run() {
      for (const s of ['../../secret', '..\\..\\secret', '/etc/passwd', 'a/../../b']) {
        const cleaned = safeFilename(s);
        if (cleaned.includes('..') || cleaned.includes('/') || cleaned.includes('\\')) {
          throw new Error(`unsafe filename: ${s} → ${cleaned}`);
        }
        const key = tenantStorageKey(TENANT_A, s);
        if (!key.startsWith(`${TENANT_A}/`) || key.includes('..')) {
          throw new Error(`unsafe key for ${s}: ${key}`);
        }
      }
    },
  },
  {
    id: 'ISO-13',
    name: 'Export-scope counts match tenant ownership',
    async run() {
      return withClient(APP_URL, async (client) => {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
        const a = await client.query(`SELECT count(*)::int AS n FROM grants`);
        await client.query('ROLLBACK');

        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_B]);
        const b = await client.query(`SELECT count(*)::int AS n FROM grants`);
        await client.query('ROLLBACK');

        const owner = await withClient(OWNER_URL, async (c) => {
          const g = await c.query(
            `SELECT tenant_id::text AS tid, count(*)::int AS n FROM grants GROUP BY 1`,
          );
          return Object.fromEntries(g.rows.map((r) => [r.tid, r.n]));
        });
        if (a.rows[0].n !== owner[TENANT_A]) {
          throw new Error(`A mismatch rls=${a.rows[0].n} actual=${owner[TENANT_A]}`);
        }
        if (b.rows[0].n !== owner[TENANT_B]) {
          throw new Error(`B mismatch rls=${b.rows[0].n} actual=${owner[TENANT_B]}`);
        }
        return `A=${a.rows[0].n} B=${b.rows[0].n}`;
      });
    },
  },
  {
    id: 'ISO-14',
    name: 'Service roles are NOBYPASSRLS',
    async run() {
      return withClient(OWNER_URL, async (client) => {
        const roles = await client.query(
          `SELECT rolname, rolsuper, rolbypassrls
           FROM pg_roles
           WHERE rolname LIKE 'ngois%' OR rolname LIKE 'svc_%'
           ORDER BY rolname`,
        );
        const offenders = roles.rows.filter(
          (r) => r.rolname !== 'ngois' && (r.rolsuper || r.rolbypassrls),
        );
        if (offenders.length) throw new Error(offenders.map((r) => r.rolname).join(', '));
        if (!roles.rows.some((r) => r.rolname === 'ngois_app')) {
          throw new Error('ngois_app missing');
        }
        return roles.rows.map((r) => r.rolname).join(',');
      });
    },
  },
  {
    id: 'ISO-15',
    name: 'Pooled connection has no residual tenant context',
    async run() {
      const pool = new pg.Pool({ connectionString: APP_URL, max: 1 });
      try {
        const c1 = await pool.connect();
        try {
          await c1.query('BEGIN');
          await c1.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
          await c1.query('COMMIT');
        } finally {
          c1.release();
        }
        const c2 = await pool.connect();
        try {
          const after = await c2.query(`SELECT current_setting('app.tenant_id', true) AS v`);
          if (after.rows[0].v === TENANT_A) {
            throw new Error('residual tenant context leaked (SET vs SET LOCAL)');
          }
        } finally {
          c2.release();
        }
      } finally {
        await pool.end();
      }
    },
  },
];

async function main() {
  console.log('Tenant isolation suite (SDD §23.9 — 15 categories)');
  console.log(`  API: ${API_BASE} require=${REQUIRE_API}`);

  await loadRedisHelpers().catch(() => {
    throw new Error('Build @ngois/tenant-context first: npm run build -w @ngois/tenant-context');
  });

  const apiUp = await apiAvailable();
  console.log(`  API up: ${apiUp}`);

  let failed = 0;
  for (const cat of CATEGORIES) {
    try {
      if (cat.needsApi && !apiUp) {
        if (REQUIRE_API) throw new Error('API required but unavailable');
        throw new Error('API unavailable — start stack or set ISOLATION_REQUIRE_API=1 in CI');
      }
      const detail = await cat.run({ apiUp });
      console.log(`PASS  ${cat.id}  ${cat.name}${detail ? ` — ${detail}` : ''}`);
    } catch (err) {
      failed += 1;
      console.error(
        `FAIL  ${cat.id}  ${cat.name} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`\nSummary: ${CATEGORIES.length - failed}/${CATEGORIES.length} passed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
