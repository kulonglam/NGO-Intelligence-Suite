/**
 * Bring up / smoke-check the production-shaped compose stack.
 * If Docker is unavailable, validates compose inventory and writes skip evidence.
 *
 *   npm run stack:prod-shaped
 *   npm run stack:prod-shaped -- --down
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compose = join(root, 'docker-compose.prod-shaped.yml');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });
const down = process.argv.includes('--down');

if (!existsSync(compose)) {
  console.error('Missing docker-compose.prod-shaped.yml');
  process.exit(1);
}

function hasDocker() {
  const r = spawnSync('docker', ['version'], { encoding: 'utf8', shell: true });
  return r.status === 0;
}

function dc(args) {
  const r = spawnSync('docker', ['compose', '-f', compose, ...args], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  return r.status ?? 1;
}

if (!hasDocker()) {
  writeFileSync(
    join(evidenceDir, 'prod-shaped-stack.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        docker: false,
        composePresent: true,
        skipped: true,
        note: 'Docker CLI unavailable — compose inventory only; use drill:dr-failover process analogue',
      },
      null,
      2,
    ),
  );
  console.log('stack:prod-shaped SKIP (docker unavailable) — compose file present');
  process.exit(0);
}

if (down) {
  process.exit(dc(['--profile', 'primary', '--profile', 'dr', 'down', '-v']) === 0 ? 0 : 1);
}

console.log('Starting primary profile (postgres, redis, otel, prometheus, loki)…');
const up = dc(['--profile', 'primary', 'up', '-d']);
if (up !== 0) {
  console.error('stack:prod-shaped FAIL — docker compose up');
  process.exit(1);
}

async function wait(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return true;
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const checks = [
  ['prometheus', 'http://127.0.0.1:9090/-/healthy'],
  ['loki', 'http://127.0.0.1:3100/ready'],
];

let ok = true;
for (const [name, url] of checks) {
  const ready = await wait(url);
  console.log(ready ? `OK   ${name}` : `FAIL ${name}`);
  if (!ready) ok = false;
}

const redis = spawnSync('docker', ['exec', 'ngois-ps-redis', 'redis-cli', 'ping'], {
  encoding: 'utf8',
  shell: true,
});
const redisOk = (redis.stdout ?? '').includes('PONG');
console.log(redisOk ? 'OK   redis' : 'FAIL redis');
if (!redisOk) ok = false;

const pg = spawnSync(
  'docker',
  ['exec', 'ngois-ps-primary', 'pg_isready', '-U', 'ngois', '-d', 'ngois'],
  { encoding: 'utf8', shell: true },
);
const pgOk = pg.status === 0;
console.log(pgOk ? 'OK   postgres-primary' : 'FAIL postgres-primary');
if (!pgOk) ok = false;

writeFileSync(
  join(evidenceDir, 'prod-shaped-stack.json'),
  JSON.stringify({ at: new Date().toISOString(), docker: true, ok }, null, 2),
);

if (!ok) {
  console.error('stack:prod-shaped FAIL');
  process.exit(1);
}
console.log('stack:prod-shaped OK (infra up; app services run on host via npm)');
