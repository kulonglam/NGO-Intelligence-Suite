/**
 * Coverage floors for @ngois/rbac, @ngois/crypto, @ngois/audit.
 * Overall package ≥80%; crypto/authz suites target ≥95% on exercised units.
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const c8Bin = join(root, 'node_modules', 'c8', 'bin', 'c8.js');

if (!existsSync(c8Bin)) {
  console.error('c8 missing — run npm install');
  process.exit(1);
}

const packages = [
  { name: '@ngois/rbac', dir: 'backend/packages/rbac', floor: 80 },
  { name: '@ngois/crypto', dir: 'backend/packages/crypto', floor: 80 },
  { name: '@ngois/audit', dir: 'backend/packages/audit', floor: 80 },
];

let failed = false;
for (const pkg of packages) {
  const cwd = join(root, pkg.dir);
  const outDir = join(cwd, 'coverage');
  console.log(`\n=== coverage ${pkg.name} ===`);
  const r = spawnSync(
    process.execPath,
    [
      c8Bin,
      '--reporter=text-summary',
      '--reporter=json-summary',
      `--reports-dir=${outDir}`,
      '--exclude=**/*.test.ts',
      '--exclude=**/verify-chain.ts',
      '--exclude=**/generate-sql.ts',
      join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      '--test',
      'src/**/*.test.ts',
    ],
    { cwd, env: process.env, stdio: 'inherit' },
  );
  if (r.status !== 0) {
    // fallback: npm test under c8 via npx from package
    const r2 = spawnSync(
      process.execPath,
      [
        c8Bin,
        '--reporter=text-summary',
        '--reporter=json-summary',
        `--reports-dir=${outDir}`,
        '--exclude=**/*.test.ts',
        'npm',
        'test',
      ],
      { cwd, env: process.env, stdio: 'inherit', shell: true },
    );
    if (r2.status !== 0) {
      console.error(`tests failed for ${pkg.name}`);
      failed = true;
      continue;
    }
  }
  const summaryPath = join(outDir, 'coverage-summary.json');
  if (!existsSync(summaryPath)) {
    console.error(`missing coverage summary for ${pkg.name}`);
    failed = true;
    continue;
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const total = summary.total?.lines?.pct ?? 0;
  console.log(`${pkg.name} lines: ${total}% (floor ${pkg.floor}%)`);
  if (total < pkg.floor) {
    console.error(`FAIL ${pkg.name} overall coverage ${total} < ${pkg.floor}`);
    failed = true;
  }

  // Authz / crypto suite floor: index.ts lines ≥95% when present in summary
  for (const [file, stats] of Object.entries(summary)) {
    if (file === 'total') continue;
    if (!/index\.ts$/.test(file.replace(/\\/g, '/'))) continue;
    const pct = stats.lines?.pct ?? 0;
    if (pkg.name === '@ngois/crypto' || pkg.name === '@ngois/rbac') {
      if (pct < 95) {
        console.error(`FAIL ${pkg.name} suite ${file}: ${pct}% < 95%`);
        failed = true;
      } else {
        console.log(`OK   ${pkg.name} suite ${file}: ${pct}%`);
      }
    }
  }
}

if (failed) process.exit(1);
console.log('\ntest:coverage OK');
