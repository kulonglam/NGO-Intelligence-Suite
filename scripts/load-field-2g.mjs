/**
 * Local proxy for Phase 3 2G gate — 40 submissions within 90s, zero loss.
 *
 *   npm run load:field-2g
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@design-partner.example';
const PASSWORD = process.env.SMOKE_HR_PASSWORD ?? 'changeme';
const COUNT = Number(process.env.FIELD_2G_COUNT ?? 40);
const BUDGET_MS = Number(process.env.FIELD_2G_BUDGET_MS ?? 90_000);

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${GATEWAY}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} → ${res.status}: ${json.errors?.[0]?.message}`);
  }
  return { status: res.status, data: json.data };
}

const login = await api('/v1/auth/dev/login', {
  method: 'POST',
  body: { email: EMAIL, password: PASSWORD },
});
const token = login.data.access_token ?? login.data.token;
const forms = await api('/v1/field-data/forms/assigned', { token });
const formVersionId = forms.data[0].form_version_id;

const uuids = Array.from({ length: COUNT }, () => randomUUID());
const t0 = performance.now();
const batch = await api('/v1/field-data/submissions/batch', {
  method: 'POST',
  token,
  body: {
    submissions: uuids.map((client_uuid, i) => ({
      client_uuid,
      form_version_id: formVersionId,
      captured_at: new Date().toISOString(),
      payload: { settlement: '2G-Lab', household_size: String((i % 7) + 1) },
    })),
  },
});
const elapsed = performance.now() - t0;

const accepted = batch.data.results.filter(
  (r) => r.status === 'accepted' || r.status === 'flagged' || r.status === 'idempotent_replay',
).length;
const lost = COUNT - accepted;
const pass = lost === 0 && elapsed < BUDGET_MS;

const evidence = {
  gate: 'phase3-field-2g-local',
  generated_at: new Date().toISOString(),
  count: COUNT,
  accepted,
  lost,
  elapsed_ms: Math.round(elapsed),
  budget_ms: BUDGET_MS,
  note: 'Local gateway throughput proxy — not a physical 2G radio trial',
  pass,
};
writeFileSync(join(evidenceDir, 'field-2g-load.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
if (!pass) {
  console.error('load:field-2g FAIL');
  process.exit(1);
}
console.log('load:field-2g PASS');
