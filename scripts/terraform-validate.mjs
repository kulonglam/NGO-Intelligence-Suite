/**
 * terraform validate on stub envs (no apply). Skips cleanly if terraform missing.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const tfCheck = spawnSync('terraform', ['version'], { encoding: 'utf8', shell: true });
const hasTf = tfCheck.status === 0;

const envs = ['dev', 'staging', 'prod', 'dr'];
const results = [];

if (!hasTf) {
  const evidence = {
    at: new Date().toISOString(),
    terraformInstalled: false,
    skipped: true,
    note: 'terraform CLI not installed — inventory-only pass',
    envs,
  };
  writeFileSync(join(evidenceDir, 'terraform-validate.json'), JSON.stringify(evidence, null, 2));
  console.log('terraform-validate SKIP (CLI missing) — evidence written');
  process.exit(0);
}

let failed = false;
for (const env of envs) {
  const dir = join(root, 'infra', 'terraform', 'envs', env);
  if (!existsSync(join(dir, 'main.tf'))) {
    results.push({ env, ok: false, error: 'missing main.tf' });
    failed = true;
    continue;
  }
  const init = spawnSync('terraform', ['init', '-backend=false', '-input=false'], {
    cwd: dir,
    encoding: 'utf8',
    shell: true,
  });
  const validate = spawnSync('terraform', ['validate', '-no-color'], {
    cwd: dir,
    encoding: 'utf8',
    shell: true,
  });
  const ok = init.status === 0 && validate.status === 0;
  results.push({
    env,
    ok,
    init: init.status,
    validate: validate.status,
    stderr: (validate.stderr || init.stderr || '').slice(0, 500),
  });
  console.log(ok ? `OK   terraform validate ${env}` : `FAIL terraform validate ${env}`);
  if (!ok) failed = true;
}

writeFileSync(
  join(evidenceDir, 'terraform-validate.json'),
  JSON.stringify({ at: new Date().toISOString(), terraformInstalled: true, results }, null, 2),
);

if (failed) process.exit(1);
console.log('terraform-validate OK');
