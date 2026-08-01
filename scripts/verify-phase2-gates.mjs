import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const boardPath = join(root, 'ops', 'phase2-gate-status.md');

const board = readFileSync(boardPath, 'utf8');
const MUST_BLOCKED = new Set([]);
const MUST_PASS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']);

let failed = false;

for (const id of MUST_BLOCKED) {
  const row = board.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!row?.includes('BLOCKED')) {
    console.error(`FAIL gate #${id} must be BLOCKED`);
    failed = true;
  } else {
    console.log(`OK   gate #${id} BLOCKED`);
  }
}

for (const id of MUST_PASS) {
  const row = board.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!row?.includes('PASS')) {
    console.error(`FAIL gate #${id} should be PASS on board`);
    failed = true;
  } else {
    console.log(`OK   gate #${id} PASS`);
  }
}

if (process.env.PHASE2_RUN_FIXTURES === '1') {
  const r = spawnSync('npm', ['run', 'test:payroll-fixtures'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) {
    console.error('FAIL payroll fixture tests');
    failed = true;
  }
}

const requiredPaths = [
  'backend/services/hr-payroll-service/src/index.ts',
  'backend/services/reporting-service/src/index.ts',
  'backend/services/grant-service/src/coa-expenses.ts',
  'scripts/smoke-phase2-e2e.mjs',
  'scripts/drill-erasure.mjs',
  'scripts/canary-analysis-stub.mjs',
  'scripts/load-payroll-500.mjs',
  'scripts/drill-canary-abort.mjs',
  'scripts/accountant-review-pack.mjs',
  'scripts/dpia-attest.mjs',
  'ops/compliance/dpia-phase2.md',
  'ops/compliance/dpia-attestation.json',
  'ops/compliance/accountant-review/attestation.json',
  'ops/compliance/retention-schedule.md',
  'infra/kubernetes/canary/analysis-template.yaml',
  'infra/observability/prometheus/rules/phase2-alerts.yaml',
  'ops/drills/evidence/load-payroll-500.json',
  'ops/drills/evidence/canary-abort-drill.json',
  'ops/drills/evidence/accountant-review.json',
  'ops/drills/evidence/dpia-approval.json',
];
for (const rel of requiredPaths) {
  if (!existsSync(join(root, ...rel.split('/')))) {
    console.error(`FAIL missing ${rel}`);
    failed = true;
  }
}

function evidencePass(rel, label) {
  const p = join(root, ...rel.split('/'));
  if (!existsSync(p)) return;
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    if (j.pass === false || j.status === 'rejected') {
      console.error(`FAIL ${label} evidence not passing: ${rel}`);
      failed = true;
    } else {
      console.log(`OK   evidence ${label}`);
    }
  } catch (err) {
    console.error(`FAIL cannot parse ${rel}: ${err.message}`);
    failed = true;
  }
}

evidencePass('ops/drills/evidence/load-payroll-500.json', 'load-500');
evidencePass('ops/drills/evidence/canary-abort-drill.json', 'canary-abort');
evidencePass('ops/drills/evidence/accountant-review.json', 'accountant');
evidencePass('ops/drills/evidence/dpia-approval.json', 'dpia');

if (failed) process.exit(1);
console.log('verify:phase2-gates OK');
