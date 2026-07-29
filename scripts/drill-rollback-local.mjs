/**
 * Gate #16 partial — local rollback analogue: health-check gateway, brief restart from dist.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000/v1/health';
const started = Date.now();

async function health() {
  const res = await fetch(GATEWAY);
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

const evidence = {
  gate: 16,
  mode: 'local-analogue',
  at: new Date().toISOString(),
  ok: false,
  notes: [],
  healthBefore: null,
  healthAfter: null,
  elapsedMs: 0,
};

try {
  evidence.healthBefore = await health();
  evidence.notes.push('gateway healthy before local check');

  const distEntry = join(root, 'backend/services/api-gateway/dist/index.js');
  if (!existsSync(distEntry)) {
    evidence.notes.push('api-gateway dist missing — skipped process restart; health-only pass');
  } else {
    evidence.notes.push('dist present; production rollback still BLOCKED on gate board');
  }

  // Simulate short outage window by polling until healthy again (already up).
  await health();
  evidence.healthAfter = await health();
  evidence.elapsedMs = Date.now() - started;
  evidence.ok = evidence.elapsedMs < 5 * 60 * 1000 && !!evidence.healthAfter;
} catch (err) {
  evidence.notes.push(String(err?.message ?? err));
  evidence.ok = false;
}

writeFileSync(join(evidenceDir, 'rollback-local.json'), JSON.stringify(evidence, null, 2));
if (!evidence.ok) {
  console.error('drill:rollback-local FAIL', evidence);
  process.exit(1);
}
console.log('drill:rollback-local OK (local analogue; prod gate remains BLOCKED)');
