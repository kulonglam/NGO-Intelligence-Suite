/**
 * Bundles staging inventory, canary prep, pen-test prep, and provider env docs.
 * Does NOT pass production gates #2 or #12.
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const steps = [
  ['verify:staging-ready', 'node scripts/verify-staging-ready.mjs'],
  ['check:providers-env', 'node scripts/check-providers-env.mjs'],
  ['canary:local', 'node scripts/canary-local-check.mjs'],
  ['pen-test:selfcheck', 'node scripts/pen-test-selfcheck.mjs'],
];

const results = [];
let failed = false;

for (const [id, cmd] of steps) {
  const [bin, ...args] = cmd.split(' ');
  const res = spawnSync(bin, args, { cwd: root, encoding: 'utf8' });
  const ok = res.status === 0;
  if (!ok) failed = true;
  results.push({
    id,
    ok,
    status: res.status,
    stderr: res.stderr?.slice(0, 500) ?? '',
  });
  console.log(`${ok ? 'OK' : 'FAIL'} ${id}`);
}

const evidence = {
  at: new Date().toISOString(),
  bundle: 'verify-go-live-prep',
  production_gates_still_blocked: ['2', '12'],
  results,
  pass: !failed,
};

writeFileSync(join(evidenceDir, 'go-live-prep.json'), JSON.stringify(evidence, null, 2));

if (failed) {
  console.error('verify:go-live-prep FAIL');
  process.exit(1);
}
console.log('verify:go-live-prep OK (production gates #2 and #12 remain BLOCKED)');
