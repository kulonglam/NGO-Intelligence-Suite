import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const boardPath = join(root, 'ops', 'phase2-gate-status.md');

const board = readFileSync(boardPath, 'utf8');
const MUST_BLOCKED = new Set(['4', '7', '10', '11', '12', '13']);
const MUST_PASS = new Set(['1', '2', '3', '5', '6', '8', '9']);

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

if (!existsSync(join(root, 'backend/services/hr-payroll-service/src/index.ts'))) {
  console.error('FAIL hr-payroll-service missing');
  failed = true;
}

if (!existsSync(join(root, 'backend/services/reporting-service/src/index.ts'))) {
  console.error('FAIL reporting-service missing');
  failed = true;
}

if (failed) process.exit(1);
console.log('verify:phase2-gates OK');
