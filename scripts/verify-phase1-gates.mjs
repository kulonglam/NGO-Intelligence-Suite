/**
 * Verify Phase 1 gate board: BLOCKED gates are allowed; PASS (local) gates
 * must have evidence files or runnable checks available.
 */
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const boardPath = join(root, 'ops', 'phase1-gate-status.md');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const board = readFileSync(boardPath, 'utf8');

/** Gates that must remain BLOCKED until external / prod evidence exists. */
const MUST_BLOCKED = new Set(['2', '12']);

/** Local PASS gates that require evidence artefacts after drills. */
const EVIDENCE = {
  7: 'audit-chain.json',
  8: 'encryption-sample.json',
  9: 'backup-restore.json',
  10: 'dr-failover.json',
  16: 'rollback-local.json',
  17: 'rb05-onboarding.json',
};

let failed = false;

for (const id of MUST_BLOCKED) {
  const row = board.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!row || !row.includes('BLOCKED')) {
    console.error(`FAIL gate #${id} must be BLOCKED on the board until cloud/external evidence exists`);
    failed = true;
  } else {
    console.log(`OK   gate #${id} BLOCKED (expected)`);
  }
}

for (const id of ['10', '16']) {
  const row = board.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!row?.includes('PASS')) {
    console.error(`FAIL gate #${id} should be PASS (local) on the board`);
    failed = true;
  } else {
    console.log(`OK   gate #${id} PASS (local) on board`);
  }
}

const requireEvidence = process.env.PHASE1_REQUIRE_EVIDENCE === '1';
for (const [id, file] of Object.entries(EVIDENCE)) {
  const abs = join(evidenceDir, file);
  const row = board.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!row?.includes('PASS')) {
    console.error(`FAIL gate #${id} should be PASS (local) on the board`);
    failed = true;
    continue;
  }
  if (!existsSync(abs)) {
    if (requireEvidence) {
      console.error(`FAIL gate #${id} missing evidence ${file}`);
      failed = true;
    } else {
      console.log(`WARN gate #${id} evidence ${file} not yet generated (ok without PHASE1_REQUIRE_EVIDENCE=1)`);
    }
  } else {
    console.log(`OK   gate #${id} evidence ${file}`);
  }
}

if (!board.includes('PASS (local)') || !board.includes('BLOCKED')) {
  console.error('FAIL gate board missing PASS (local) / BLOCKED sections');
  failed = true;
}

if (failed) {
  console.error('verify:phase1-gates FAIL');
  process.exit(1);
}
console.log('verify:phase1-gates OK');
