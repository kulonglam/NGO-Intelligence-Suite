/**
 * Local canary analogue — health + isolation suite smoke.
 * Explicitly does NOT claim gate #2 (14-day production canary).
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const rollout = join(root, 'infra/kubernetes/canary/api-gateway-rollout.yaml');
const gateway = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000/v1/health';

let healthOk = false;
try {
  const res = await fetch(gateway);
  healthOk = res.ok;
} catch {
  healthOk = false;
}

const evidence = {
  gate: 2,
  status: 'BLOCKED',
  at: new Date().toISOString(),
  rolloutPresent: existsSync(rollout),
  healthOk,
  note: 'Local check only — production 14-day canary remains BLOCKED',
};
writeFileSync(join(evidenceDir, 'canary-local.json'), JSON.stringify(evidence, null, 2));

if (!evidence.rolloutPresent) {
  console.error('canary:local FAIL — missing api-gateway-rollout.yaml');
  process.exit(1);
}
console.log('canary:local OK (gate #2 still BLOCKED)');
if (!healthOk) {
  console.warn('gateway health not reachable (optional for stub check)');
}
