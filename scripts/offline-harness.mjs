/**
 * Offline harness — mid-batch interrupt + client_uuid replay → zero loss.
 *
 * Simulates: accept N-1 items, crash before last ack, then replay full batch.
 * Server must return accepted for new + idempotent_replay for already stored.
 *
 *   npm run offline:harness
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
if (!forms.length) throw new Error('No assigned forms — run db:seed');
const formVersionId = forms[0].form_version_id;

const uuids = Array.from({ length: 5 }, () => randomUUID());
const makeBatch = (slice) => ({
  submissions: slice.map((client_uuid) => ({
    client_uuid,
    form_version_id: formVersionId,
    captured_at: new Date().toISOString(),
    payload: { settlement: 'Harness', household_size: '3' },
  })),
});

// "Interrupt": only first 3 of 5 reach the server
const partial = await api('/v1/field-data/submissions/batch', {
  method: 'POST',
  token,
  body: makeBatch(uuids.slice(0, 3)),
});
const acceptedPartial = partial.results.filter((r) => r.status === 'accepted').length;

// Replay full batch after reconnect
const full = await api('/v1/field-data/submissions/batch', {
  method: 'POST',
  token,
  body: makeBatch(uuids),
});
const replayed = full.results.filter((r) => r.status === 'idempotent_replay').length;
const newlyAccepted = full.results.filter((r) => r.status === 'accepted').length;
const lost = uuids.length - (replayed + newlyAccepted);

const evidence = {
  gate: 'phase3-offline-harness',
  generated_at: new Date().toISOString(),
  batch_size: uuids.length,
  partial_accepted: acceptedPartial,
  replayed,
  newly_accepted: newlyAccepted,
  lost,
  pass: lost === 0 && replayed === 3 && newlyAccepted === 2,
};

writeFileSync(join(evidenceDir, 'offline-harness.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
if (!evidence.pass) {
  console.error('offline:harness FAIL');
  process.exit(1);
}
console.log('offline:harness PASS');
