/**
 * Local canary analysis stub — injects a regression metric and decides abort/promote.
 * Does NOT satisfy Phase 2 gate #10 (production Argo). Evidence for local drills.
 *
 *   node scripts/canary-analysis-stub.mjs
 *   $env:CANARY_INJECT_REGRESSION = '1'; node scripts/canary-analysis-stub.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(outDir, { recursive: true });

const inject = process.env.CANARY_INJECT_REGRESSION === '1';
const baselineErrorRate = 0.5;
const canaryErrorRate = inject ? 8.5 : 0.6;
const threshold = 2.0; // absolute pp over baseline

const decision =
  canaryErrorRate - baselineErrorRate > threshold
    ? { action: 'abort', reason: 'error_rate_regression' }
    : { action: 'promote', reason: 'within_budget' };

const evidence = {
  generated_at: new Date().toISOString(),
  baseline_error_rate_pct: baselineErrorRate,
  canary_error_rate_pct: canaryErrorRate,
  threshold_pp: threshold,
  inject_regression: inject,
  decision,
  note: 'Local stub only — production Argo Rollouts analysis required for gate #10',
};

const path = join(outDir, 'canary-analysis.json');
writeFileSync(path, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(decision));
console.log('wrote', path);
if (inject && decision.action !== 'abort') process.exit(1);
if (!inject && decision.action !== 'promote') process.exit(1);
