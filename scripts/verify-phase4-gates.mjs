import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const board = readFileSync(join(root, 'ops', 'phase4-gate-status.md'), 'utf8');

let failed = false;
if (board.includes('BLOCKED')) {
  console.error('FAIL board contains BLOCKED');
  failed = true;
}

for (let id = 1; id <= 15; id++) {
  const row = board.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!row?.includes('PASS')) {
    console.error(`FAIL gate #${id}`);
    failed = true;
  } else console.log(`OK   gate #${id} PASS`);
}

const required = [
  'backend/db/migrations/016_phase4_intelligence.sql',
  'backend/packages/ai-redaction/src/index.ts',
  'backend/services/analytics-service/src/index.ts',
  'backend/services/ai-insights-service/src/index.ts',
  'backend/services/integration-service/src/index.ts',
  'frontend/src/views/IntelligenceView.vue',
  'frontend/src/views/AiInsightsView.vue',
  'frontend/src/views/ComplianceView.vue',
  'scripts/smoke-phase4-e2e.mjs',
  'scripts/generate-redaction-corpus.mjs',
  'scripts/eval-ai-injection.mjs',
  'scripts/finops-attribution.mjs',
];
for (const rel of required) {
  if (!existsSync(join(root, ...rel.split('/')))) {
    console.error(`FAIL missing ${rel}`);
    failed = true;
  }
}

if (process.env.PHASE4_REQUIRE_EVIDENCE === '1') {
  for (const rel of [
    'ops/drills/evidence/ai-redaction-corpus.json',
    'ops/drills/evidence/ai-injection-eval.json',
    'ops/drills/evidence/finops-attribution.json',
  ]) {
    if (!existsSync(join(root, ...rel.split('/')))) {
      console.error(`FAIL missing evidence ${rel}`);
      failed = true;
    } else console.log(`OK   evidence ${rel}`);
  }
}

if (process.env.PHASE4_RUN_UNIT === '1') {
  const r = spawnSync('npm', ['run', 'test', '-w', '@ngois/ai-redaction'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) {
    console.error('FAIL ai-redaction tests');
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('verify:phase4-gates OK');
