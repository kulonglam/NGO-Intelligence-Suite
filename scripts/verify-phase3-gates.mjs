import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const boardPath = join(root, 'ops', 'phase3-gate-status.md');
const board = readFileSync(boardPath, 'utf8');

const MUST_PASS = new Set([
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
]);

let failed = false;

if (board.includes('BLOCKED')) {
  console.error('FAIL board still contains BLOCKED rows');
  failed = true;
}

for (const id of MUST_PASS) {
  const row = board.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!row?.includes('PASS')) {
    console.error(`FAIL gate #${id} should be PASS`);
    failed = true;
  } else console.log(`OK   gate #${id} PASS`);
}

const required = [
  'backend/db/migrations/014_field_beneficiary.sql',
  'backend/db/migrations/015_lms_notifications_devices.sql',
  'backend/packages/beneficiary-dedup/src/index.ts',
  'backend/packages/vulnerability-score/src/index.ts',
  'backend/packages/k-anonymity/src/index.ts',
  'backend/services/beneficiary-service/src/index.ts',
  'backend/services/field-data-service/src/index.ts',
  'backend/services/lms-service/src/index.ts',
  'backend/services/notification-service/src/index.ts',
  'frontend/src/offline/db.ts',
  'frontend/src/offline/sync.ts',
  'frontend/src/views/FieldView.vue',
  'frontend/src/views/TrainingView.vue',
  'frontend/src/views/NotificationsView.vue',
  'scripts/smoke-field-e2e.mjs',
  'scripts/smoke-phase3-e2e.mjs',
  'scripts/smoke-paper-fallback.mjs',
  'scripts/offline-harness.mjs',
  'scripts/load-field-2g.mjs',
  'scripts/chaos-catalogue.mjs',
  'ops/compliance/dpia-phase3-beneficiary.md',
];
for (const rel of required) {
  if (!existsSync(join(root, ...rel.split('/')))) {
    console.error(`FAIL missing ${rel}`);
    failed = true;
  }
}

const evidenceFiles = [
  'ops/drills/evidence/chaos-catalogue.json',
  'ops/drills/evidence/field-2g-load.json',
  'ops/drills/evidence/paper-fallback.json',
  'ops/drills/evidence/dpia-phase3-approval.json',
];
if (process.env.PHASE3_REQUIRE_EVIDENCE === '1') {
  for (const rel of evidenceFiles) {
    if (!existsSync(join(root, ...rel.split('/')))) {
      console.error(`FAIL missing evidence ${rel}`);
      failed = true;
    } else console.log(`OK   evidence ${rel}`);
  }
}

if (process.env.PHASE3_RUN_UNIT === '1') {
  for (const pkg of [
    '@ngois/beneficiary-dedup',
    '@ngois/vulnerability-score',
    '@ngois/k-anonymity',
  ]) {
    const r = spawnSync('npm', ['run', 'test', '-w', pkg], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    });
    if (r.status !== 0) {
      console.error(`FAIL ${pkg} tests`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('verify:phase3-gates OK');
