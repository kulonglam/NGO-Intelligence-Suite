/**
 * Gate #10 stub — validate DR terraform inventory exists (does not claim cloud RTO).
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const drTf = join(root, 'infra', 'terraform', 'envs', 'dr');
const drillDoc = join(root, 'ops', 'drills', 'regional-failover.md');

const inventory = {
  terraformDrDir: existsSync(drTf),
  terraformFiles: existsSync(drTf) ? readdirSync(drTf) : [],
  drillTemplate: existsSync(drillDoc),
};

const ok = inventory.terraformDrDir && inventory.drillTemplate;
const evidence = {
  gate: 10,
  status: 'BLOCKED',
  at: new Date().toISOString(),
  okStub: ok,
  inventory,
  note: 'Cloud regional failover with measured RTO remains BLOCKED',
};
writeFileSync(join(evidenceDir, 'dr-stub-inventory.json'), JSON.stringify(evidence, null, 2));

if (!ok) {
  console.error('drill:dr-stub FAIL — missing DR stubs');
  process.exit(1);
}
console.log('drill:dr-stub OK (gate #10 still BLOCKED for cloud)');
