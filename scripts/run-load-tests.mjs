/**
 * Runner for scaled L1 + L2 k6 profiles. Skips cleanly if k6 is not installed
 * unless LOAD_REQUIRE=1.
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['k6'], {
  encoding: 'utf8',
});
if (which.status !== 0) {
  const msg = 'k6 not installed';
  if (process.env.LOAD_REQUIRE === '1') {
    console.error(msg);
    process.exit(1);
  }
  writeFileSync(
    join(evidenceDir, 'load-scaled.json'),
    JSON.stringify({ ok: false, skipped: true, reason: msg, at: new Date().toISOString() }, null, 2),
  );
  console.warn(`WARN ${msg} — skipping (set LOAD_REQUIRE=1 to fail)`);
  process.exit(0);
}

const gateway = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000';
const results = [];
for (const profile of ['L1', 'L2']) {
  const script =
    profile === 'L1'
      ? join(root, 'load/k6/l1-steady.js')
      : join(root, 'load/k6/l1-steady.js');
  console.log(`\n=== k6 ${profile} ===`);
  const r = spawnSync(
    'k6',
    ['run', '-e', `LOAD_PROFILE=${profile}`, '-e', `GATEWAY_URL=${gateway}`, script],
    { cwd: root, stdio: 'inherit', env: process.env },
  );
  results.push({ profile, status: r.status });
  if (r.status !== 0) {
    writeFileSync(
      join(evidenceDir, 'load-scaled.json'),
      JSON.stringify({ ok: false, results, at: new Date().toISOString() }, null, 2),
    );
    process.exit(r.status ?? 1);
  }
}

writeFileSync(
  join(evidenceDir, 'load-scaled.json'),
  JSON.stringify({ ok: true, scaled: true, results, at: new Date().toISOString() }, null, 2),
);
console.log('test:load OK (local scaled)');
