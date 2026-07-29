/**
 * Erasure E2E drill (local) — create → approve → execute → verify tombstone.
 * Optionally notes restore-replay: erased data may remain in backups until aged out.
 *
 *   $env:DATABASE_URL = 'postgres://ngois_app:...'
 *   node scripts/drill-erasure.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(outDir, { recursive: true });

const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000';
const url =
  process.env.DATABASE_URL ?? 'postgres://ngois_app:ngois_app_dev@127.0.0.1:5433/ngois';

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${GATEWAY}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(`${method} ${path} → ${res.status}: ${json.errors?.[0]?.message}`);
  }
  return json.data;
}

const recorder = await api('/v1/auth/dev/login', {
  method: 'POST',
  body: { email: 'hr@design-partner.example', password: 'changeme' },
});
const hrToken = recorder.access_token;

const approver = await api('/v1/auth/dev/login', {
  method: 'POST',
  body: { email: 'admin@design-partner.example', password: 'changeme' },
});
const adminToken = approver.access_token;

const employees = await api('/v1/hr/employees', { token: hrToken });
const subject = employees.find((e) => e.employee_number?.startsWith('EMP-S')) ?? employees.at(-1);
if (!subject) throw new Error('No employee to erase');

const created = await api('/v1/tenant/erasure-requests', {
  method: 'POST',
  token: hrToken,
  body: {
    subject_type: 'employee',
    subject_id: subject.id,
    verification_method: 'staff_attestation',
    reason: 'drill',
  },
});

await api(`/v1/tenant/erasure-requests/${created.id}/approve`, {
  method: 'POST',
  token: adminToken,
});
await api(`/v1/tenant/erasure-requests/${created.id}/execute`, {
  method: 'POST',
  token: adminToken,
});

const pool = new pg.Pool({ connectionString: url });
const client = await pool.connect();
await client.query('BEGIN');
await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [approver.user.tenant_id]);
const emp = await client.query(
  `SELECT display_name, is_deleted, status FROM employees WHERE id = $1`,
  [subject.id],
);
const log = await client.query(
  `SELECT count(*)::int AS n FROM erasure_log WHERE erasure_request_id = $1`,
  [created.id],
);
const audit = await client.query(
  `SELECT count(*)::int AS n FROM audit_events WHERE action = 'compliance.erasure.executed'`,
);
await client.query('ROLLBACK');
client.release();
await pool.end();

const residueOk =
  emp.rows[0]?.display_name === 'REDACTED' &&
  emp.rows[0]?.is_deleted === true &&
  log.rows[0].n >= 1 &&
  audit.rows[0].n >= 1;

const evidence = {
  generated_at: new Date().toISOString(),
  erasure_request_id: created.id,
  subject_id: subject.id,
  tombstone: emp.rows[0],
  erasure_log_rows: log.rows[0].n,
  audit_preserved: audit.rows[0].n >= 1,
  restore_replay_note:
    'Backups retain pre-erasure snapshots until retention age-out (disclosed; not rewritten).',
  pass: residueOk,
};

writeFileSync(join(outDir, 'erasure-e2e.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
if (!residueOk) process.exit(1);
console.log('drill-erasure PASS');
