import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const board = readFileSync(join(root, 'ops', 'webhooks-gate-status.md'), 'utf8');

let failed = false;
if (board.includes('BLOCKED')) {
  console.error('FAIL board contains BLOCKED');
  failed = true;
}

for (let id = 1; id <= 10; id++) {
  const row = board.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!row?.includes('PASS')) {
    console.error(`FAIL gate #${id}`);
    failed = true;
  } else console.log(`OK   gate #${id} PASS`);
}

const required = [
  'backend/db/migrations/017_webhooks.sql',
  'backend/packages/webhook-egress/src/index.ts',
  'backend/services/webhook-dispatcher/src/index.ts',
  'backend/services/tenant-service/src/webhooks.ts',
  'frontend/src/views/WebhooksView.vue',
  'scripts/smoke-webhooks-e2e.mjs',
];
for (const rel of required) {
  if (!existsSync(join(root, ...rel.split('/')))) {
    console.error(`FAIL missing ${rel}`);
    failed = true;
  }
}

if (process.env.WEBHOOKS_RUN_UNIT === '1') {
  const r = spawnSync('npm', ['run', 'test', '-w', '@ngois/webhook-egress'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) {
    console.error('FAIL webhook-egress tests');
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('verify:webhooks-gates OK');
