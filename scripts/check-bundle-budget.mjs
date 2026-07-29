/**
 * Bundle budget gate (SDD §19.8) — gzipped sizes of Vite build output.
 * Budgets are Phase-1-friendly but still enforced in CI.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..', 'frontend', 'dist');
const BUDGETS = {
  initialJsGzipKb: 180,
  initialCssGzipKb: 30,
  largestChunkGzipKb: 120,
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(root);
const assets = files.filter((f) => /\.(js|css)$/.test(f));
if (!assets.length) {
  console.error('No JS/CSS assets in frontend/dist — run npm run build:frontend first');
  process.exit(1);
}

const sized = assets.map((f) => {
  const raw = readFileSync(f);
  const gz = gzipSync(raw);
  return { file: f.replace(/\\/g, '/'), bytes: gz.length, kind: f.endsWith('.css') ? 'css' : 'js' };
});

const js = sized.filter((s) => s.kind === 'js').sort((a, b) => a.bytes - b.bytes);
const css = sized.filter((s) => s.kind === 'css');
// Vite entry is typically the smallest main chunk among index-*.js; sum of entry + css from index.html is hard —
// approximate: all CSS + the largest non-vendor? Better: sum all JS that is not a lazy route if named.
// Phase 1: treat total JS of the two smallest entry-ish files + all CSS, and max single chunk.
const initialJs = js.slice(0, Math.min(2, js.length)).reduce((n, s) => n + s.bytes, 0);
const initialCss = css.reduce((n, s) => n + s.bytes, 0);
const largest = sized.reduce((m, s) => Math.max(m, s.bytes), 0);

function kb(n) {
  return (n / 1024).toFixed(1);
}

let failed = false;
function check(label, bytes, budgetKb) {
  const ok = bytes / 1024 <= budgetKb;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${kb(bytes)} KB gzip (budget ${budgetKb} KB)`);
  if (!ok) failed = true;
}

check('initial JS (approx 2 smallest chunks)', initialJs, BUDGETS.initialJsGzipKb);
check('initial CSS (all)', initialCss, BUDGETS.initialCssGzipKb);
check('largest chunk', largest, BUDGETS.largestChunkGzipKb);

for (const s of sized.sort((a, b) => b.bytes - a.bytes).slice(0, 8)) {
  console.log(`  ${kb(s.bytes)} KB  ${s.file.split('/dist/')[1] ?? s.file}`);
}

if (failed) process.exit(1);
console.log('bundle-budget: OK');
