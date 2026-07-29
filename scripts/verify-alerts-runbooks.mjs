/**
 * Gate #11 helper: every Phase-1 alert names an existing runbook file.
 * Also verifies Prometheus rules annotations match ops/alert-runbook-map.yaml
 * and that Phase-1 runbook files exist.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const mapPath = join(root, 'ops', 'alert-runbook-map.yaml');
const rulesPaths = [
  join(root, 'infra', 'observability', 'prometheus', 'rules', 'phase1-alerts.yaml'),
  join(root, 'infra', 'observability', 'prometheus', 'rules', 'phase2-alerts.yaml'),
];

function parseSimpleYamlAlerts(text) {
  /** Minimal parser for our constrained YAML shape (name:/runbook: lists). */
  const alerts = [];
  let current = null;
  const phase1 = [];
  const phase2 = [];
  let section = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^phase1_runbooks:\s*$/.test(line)) {
      section = 'phase1';
      continue;
    }
    if (/^phase2_runbooks:\s*$/.test(line)) {
      section = 'phase2';
      continue;
    }
    if (/^[a-zA-Z_][\w-]*:\s*$/.test(line) && !line.startsWith(' ')) {
      section = null;
    }
    const name = line.match(/^\s+-\s+name:\s+(\S+)\s*$/);
    if (name) {
      current = { name: name[1] };
      alerts.push(current);
      continue;
    }
    const rb = line.match(/^\s+runbook:\s+(\S+)\s*$/);
    if (rb && current) current.runbook = rb[1];
    const phase = line.match(/^\s+-\s+((?:docs\/sdd\/runbooks|ops\/runbooks)\/\S+)\s*$/);
    if (phase) {
      if (section === 'phase2') phase2.push(phase[1]);
      else phase1.push(phase[1]);
    }
  }
  return { alerts, phase1, phase2 };
}

const mapText = readFileSync(mapPath, 'utf8');
const map = parseSimpleYamlAlerts(mapText);
const rulesText = rulesPaths
  .filter((p) => existsSync(p))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');

const ruleAlerts = [...rulesText.matchAll(/^\s+- alert:\s+(\S+)/gm)].map((m) => m[1]);
const ruleRunbooks = Object.fromEntries(
  [...rulesText.matchAll(/- alert:\s+(\S+)[\s\S]*?runbook:\s+(\S+)/g)].map((m) => [
    m[1],
    m[2],
  ]),
);

let failed = false;

if (map.alerts.length < 12) {
  console.error(`FAIL expected ≥12 alerts in map, got ${map.alerts.length}`);
  failed = true;
}

for (const a of map.alerts) {
  if (!a.runbook) {
    console.error(`FAIL ${a.name}: missing runbook in map`);
    failed = true;
    continue;
  }
  const abs = join(root, a.runbook.replace(/\//g, '\\'));
  const absPosix = join(root, ...a.runbook.split('/'));
  if (!existsSync(absPosix)) {
    console.error(`FAIL ${a.name}: runbook missing on disk: ${a.runbook}`);
    failed = true;
  } else {
    console.log(`OK   map ${a.name} → ${a.runbook}`);
  }
  if (!ruleAlerts.includes(a.name)) {
    console.error(`FAIL ${a.name}: not defined in phase1/phase2 Prometheus rules`);
    failed = true;
  } else if (ruleRunbooks[a.name] && ruleRunbooks[a.name] !== a.runbook) {
    console.error(
      `FAIL ${a.name}: rules runbook ${ruleRunbooks[a.name]} ≠ map ${a.runbook}`,
    );
    failed = true;
  }
}

for (const name of ruleAlerts) {
  if (!map.alerts.some((a) => a.name === name)) {
    console.error(`FAIL ${name}: in Prometheus rules but not in alert-runbook-map.yaml`);
    failed = true;
  }
}

for (const rb of map.phase1) {
  const abs = join(root, ...rb.split('/'));
  if (!existsSync(abs)) {
    console.error(`FAIL phase1 runbook missing: ${rb}`);
    failed = true;
  } else {
    console.log(`OK   phase1 runbook ${rb}`);
  }
}

for (const rb of map.phase2) {
  const abs = join(root, ...rb.split('/'));
  if (!existsSync(abs)) {
    console.error(`FAIL phase2 runbook missing: ${rb}`);
    failed = true;
  } else {
    console.log(`OK   phase2 runbook ${rb}`);
  }
}

// RB-05 is ops baseline but may not be alert-linked — still must exist
const rb05 = join(root, 'docs', 'sdd', 'runbooks', 'rb-05-tenant-onboarding.md');
if (!existsSync(rb05)) {
  console.error('FAIL RB-05 missing');
  failed = true;
}

const opsPhase2 = [
  'ops/runbooks/rb-01-failed-payroll-run.md',
  'ops/runbooks/rb-02-dlq-drain-and-replay.md',
  'ops/runbooks/rb-04-certificate-rotation.md',
  'ops/runbooks/rb-06-tenant-offboarding.md',
  'ops/runbooks/rb-07-pii-erasure-request.md',
  'ops/runbooks/rb-10-canary-abort.md',
];
for (const rb of opsPhase2) {
  if (!existsSync(join(root, ...rb.split('/')))) {
    console.error(`FAIL ops Phase 2 stub missing: ${rb}`);
    failed = true;
  }
}

if (failed) {
  console.error('verify-alerts-runbooks: FAIL');
  process.exit(1);
}
console.log(
  `verify-alerts-runbooks: OK (${map.alerts.length} alerts, ${map.phase1.length} phase1 + ${map.phase2.length} phase2 runbooks)`,
);
