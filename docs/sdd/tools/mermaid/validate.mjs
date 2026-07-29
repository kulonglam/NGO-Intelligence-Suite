import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.DOMPurify = { sanitize: (s) => s, addHook: () => {} };

const mermaid = (await import('mermaid')).default;
mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

const root = process.argv[2];

const SKIP = new Set(['node_modules', '.git']);

function walk(dir) {
  let out = [];
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

let total = 0;
const failures = [];

for (const file of walk(root)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  let inBlock = false, start = 0, body = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!inBlock && /^\s*```mermaid\s*$/.test(l)) { inBlock = true; start = i + 2; body = []; continue; }
    if (inBlock && /^\s*```\s*$/.test(l)) {
      inBlock = false; total++;
      const src = body.join('\n');
      try {
        await mermaid.parse(src);
      } catch (err) {
        failures.push(`${relative(root, file)}:${start}\n    ${String(err.message || err).split('\n').slice(0, 6).join('\n    ')}`);
      }
      continue;
    }
    if (inBlock) body.push(l);
  }
}

console.log(`PARSED: ${total}`);
console.log(`FAILURES: ${failures.length}`);
for (const f of failures) console.log('  ' + f);
