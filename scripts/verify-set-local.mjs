/**
 * Static gate: tenant context must use SET LOCAL / set_config(..., true), never session SET.
 * Blocks the pool-leak class of cross-tenant defects (SDD §23.9).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const roots = [join(root, 'backend')];
const SKIP = new Set([
  // This file documents the forbidden pattern in its own source.
]);

const BAD = [
  {
    name: 'SET app.tenant_id without LOCAL',
    re: /\bSET\s+app\.tenant_id\b/i,
  },
  {
    name: 'set_config app.tenant_id with is_local=false',
    re: /set_config\s*\(\s*['"]app\.tenant_id['"]\s*,[^,]+,\s*false\s*\)/i,
  },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.data') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|js|mjs|sql)$/.test(name)) out.push(p);
  }
  return out;
}

let failed = false;
for (const base of roots) {
  for (const file of walk(base)) {
    const rel = relative(root, file);
    if (SKIP.has(rel.replace(/\\/g, '/'))) continue;
    const text = readFileSync(file, 'utf8');
    // Strip block/line comments for crude matching
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const rule of BAD) {
      const matches = stripped.match(new RegExp(rule.re.source, 'gi')) ?? [];
      for (const m of matches) {
        console.error(`FAIL ${rel}: ${rule.name} → ${m.trim()}`);
        failed = true;
      }
    }
  }
}

if (failed) {
  console.error('verify-set-local: FAIL');
  process.exit(1);
}
console.log('verify-set-local: OK (no session-scoped tenant SET)');
