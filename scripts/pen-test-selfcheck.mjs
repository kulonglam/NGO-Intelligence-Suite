/**
 * STRIDE / inventory self-check for pen-test prep. Does NOT pass gate #12.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const checks = [
  ['threat_model', 'docs/sdd/16-threat-model-stride.md'],
  ['security_arch', 'docs/sdd/14-security-architecture.md'],
  ['engagement_pack', 'ops/compliance/pen-test-engagement-pack.md'],
  ['rls_verify_script', 'scripts/verify-rls.mjs'],
  ['isolation_suite', 'scripts/isolation-suite.mjs'],
  ['webhook_ssrf_pkg', 'backend/packages/webhook-egress/src/index.ts'],
  ['canary_rollout', 'infra/kubernetes/canary/api-gateway-rollout.yaml'],
];

const results = checks.map(([id, rel]) => ({
  id,
  path: rel,
  present: existsSync(join(root, ...rel.split('/'))),
}));

const board = readFileSync(join(root, 'ops', 'phase1-gate-status.md'), 'utf8');
const gate12Blocked = /\| 12 \|.*BLOCKED/.test(board);

const evidence = {
  gate: 12,
  status: 'BLOCKED',
  at: new Date().toISOString(),
  selfcheck_pass: results.every((r) => r.present) && gate12Blocked,
  gate12_still_blocked: gate12Blocked,
  results,
  note: 'Inventory/STRIDE prep only — external pen-test report required for PASS',
};

writeFileSync(join(evidenceDir, 'pen-test-selfcheck.json'), JSON.stringify(evidence, null, 2));

if (!evidence.selfcheck_pass) {
  console.error('pen-test:selfcheck FAIL', evidence);
  process.exit(1);
}
console.log('pen-test:selfcheck OK (gate #12 remains BLOCKED)');
