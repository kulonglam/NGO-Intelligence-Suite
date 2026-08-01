/**
 * Paper fallback E2E — batch → rows → commit → provenance=paper.
 *
 *   npm run smoke:paper-fallback
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@design-partner.example';
const PASSWORD = process.env.SMOKE_HR_PASSWORD ?? 'changeme';

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
  return json.data;
}

const login = await api('/v1/auth/dev/login', {
  method: 'POST',
  body: { email: EMAIL, password: PASSWORD },
});
const token = login.access_token ?? login.token;

const forms = await api('/v1/field-data/forms/assigned', { token });
if (!forms.length) throw new Error('No assigned forms');
const formVersionId = forms[0].form_version_id;

const batch = await api('/v1/field-data/paper/batches', {
  method: 'POST',
  token,
  body: { form_version_id: formVersionId, label: `Paper drill ${Date.now()}` },
});

const serials = [1, 2, 3].map((n) => `PAP-${Date.now()}-${n}`);
await api(`/v1/field-data/paper/batches/${batch.id}/rows`, {
  method: 'POST',
  token,
  body: {
    rows: serials.map((paper_serial) => ({
      paper_serial,
      payload: { settlement: 'PaperSite', household_size: '4', notes: 'bulk entry' },
    })),
  },
});

const committed = await api(`/v1/field-data/paper/batches/${batch.id}/commit`, {
  method: 'POST',
  token,
});
if (committed.submissions_created !== 3) {
  throw new Error(`expected 3 submissions, got ${committed.submissions_created}`);
}
if (committed.provenance !== 'paper') throw new Error('provenance must be paper');

const listed = await api('/v1/field-data/submissions?provenance=paper', { token });
const ids = new Set(committed.submission_ids);
const matched = listed.filter((s) => ids.has(s.id));
if (matched.length < 3) throw new Error('paper submissions not listed');
if (!matched.every((s) => s.provenance === 'paper')) throw new Error('bad provenance');

const evidence = {
  gate: 'phase3-paper-fallback',
  generated_at: new Date().toISOString(),
  batch_id: batch.id,
  submissions_created: committed.submissions_created,
  pass: true,
};
writeFileSync(join(evidenceDir, 'paper-fallback.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
console.log('smoke:paper-fallback PASS');
