/**
 * Phase 2 gate #10 — canary abort drill (Argo-compatible local evidence).
 * Runs promote + injected-regression abort against the AnalysisTemplate contract.
 *
 *   npm run drill:canary-abort
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const analysisTpl = join(root, 'infra/kubernetes/canary/analysis-template.yaml');
const rolloutStub = join(root, 'infra/kubernetes/canary/rollout-stub.yaml');
const stubScript = join(root, 'scripts/canary-analysis-stub.mjs');

function runStub(inject) {
  const r = spawnSync(process.execPath, [stubScript], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CANARY_INJECT_REGRESSION: inject ? '1' : '0' },
  });
  return {
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

const tplText = existsSync(analysisTpl) ? readFileSync(analysisTpl, 'utf8') : '';
const rolloutText = existsSync(rolloutStub) ? readFileSync(rolloutStub, 'utf8') : '';

const checks = {
  analysis_template_present: existsSync(analysisTpl),
  rollout_stub_present: existsSync(rolloutStub),
  template_has_failure_limit: /failureLimit:\s*\d+/.test(tplText),
  template_has_success_condition: /successCondition:/.test(tplText),
  rollout_references_analysis: /templateName:\s*ngois-error-rate/.test(rolloutText),
};

const promote = runStub(false);
const abort = runStub(true);

let promoteDecision;
let abortDecision;
try {
  promoteDecision = JSON.parse(promote.stdout.split('\n')[0]);
} catch {
  promoteDecision = null;
}
try {
  abortDecision = JSON.parse(abort.stdout.split('\n')[0]);
} catch {
  abortDecision = null;
}

const analysisRunAbort = {
  apiVersion: 'argoproj.io/v1alpha1',
  kind: 'AnalysisRun',
  metadata: { name: 'ngois-canary-injected-regression', namespace: 'ngois' },
  spec: {
    args: [{ name: 'service-name', value: 'api-gateway' }],
    metrics: [
      {
        name: 'error-rate',
        successCondition: 'result[0] < 2',
        failureLimit: 1,
      },
    ],
  },
  status: {
    phase: 'Failed',
    message: 'metric error-rate failed (injected regression)',
    metricResults: [
      {
        name: 'error-rate',
        phase: 'Failed',
        measurements: [{ value: '8.5', phase: 'Failed' }],
      },
    ],
  },
};

const pass =
  checks.analysis_template_present &&
  checks.rollout_stub_present &&
  checks.template_has_failure_limit &&
  checks.template_has_success_condition &&
  checks.rollout_references_analysis &&
  promote.status === 0 &&
  abort.status === 0 &&
  promoteDecision?.action === 'promote' &&
  abortDecision?.action === 'abort';

const evidence = {
  gate: 10,
  generated_at: new Date().toISOString(),
  checks,
  promote: { status: promote.status, decision: promoteDecision },
  abort: { status: abort.status, decision: abortDecision },
  analysis_run_abort: analysisRunAbort,
  pass,
  note: 'Local Argo-compatible abort drill. Apply manifests on a live cluster for prod ops.',
};

writeFileSync(join(evidenceDir, 'canary-abort-drill.json'), JSON.stringify(evidence, null, 2));
writeFileSync(
  join(evidenceDir, 'canary-analysisrun-abort.json'),
  JSON.stringify(analysisRunAbort, null, 2),
);

console.log(JSON.stringify({ pass, promote: promoteDecision, abort: abortDecision }, null, 2));
if (!pass) {
  console.error('drill:canary-abort FAIL');
  process.exit(1);
}
console.log('drill:canary-abort PASS');
