/**
 * Run local Phase 1 drill set and refresh evidence under ops/drills/evidence/.
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = [
  'drill-audit-chain.mjs',
  'drill-encryption-sample.mjs',
  'drill-backup-restore.mjs',
  'drill-rb05-onboarding.mjs',
  'drill-rollback-local.mjs',
  'drill-dr-stub.mjs',
];

let failed = false;
for (const s of scripts) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, [join(root, 'scripts', s)], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    failed = true;
    // rollback-local may fail if gateway down — allow SKIP_ROLLBACK=1
    if (s === 'drill-rollback-local.mjs' && process.env.SKIP_ROLLBACK === '1') {
      console.warn('skipping rollback failure (SKIP_ROLLBACK=1)');
      failed = false;
    } else {
      break;
    }
  }
}

if (failed) process.exit(1);
console.log('\ndrill:phase1 complete');
