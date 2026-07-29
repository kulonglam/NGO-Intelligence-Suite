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
const rulesPath = join(
  root,
  'infra',
  'observability',
  'prometheus',
  'rules',
  'phase1-alerts.yaml',
);

function parseSimpleYamlAlerts(text) {
  /** Minimal parser for our constrained YAML shape (name:/runbook: lists). */
  const alerts = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const name = line.match(/^\s+-\s+name:\s+(\S+)\s*$/);
    if (name) {
      current = { name: name[1] };
      alerts.push(current);
      continue;
    }
    const rb = line.match(/^\s+runbook:\s+(\S+)\s*$/);
    if (rb && current) current.runbook = rb[1];
    const phase = line.match(/^\s+-\s+(docs\/sdd\/runbooks\/\S+)\s*$/);
    if (phase) {
      if (!parseSimpleYamlAlerts._phase) parseSimpleYamlAlerts._phase = [];
      parseSimpleYamlAlerts._phase.push(phase[1]);
    }
  }
  return { alerts, phase1: parseSimpleYamlAlerts._phase ?? [] };
}

const mapText = readFileSync(mapPath, 'utf8');
parseSimpleYamlAlerts._phase = [];
const map = parseSimpleYamlAlerts(mapText);
const rulesText = readFileSync(rulesPath, 'utf8');

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
    console.error(`FAIL ${a.name}: not defined in phase1-alerts.yaml`);
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

// RB-05 is ops baseline but may not be alert-linked — still must exist
const rb05 = join(root, 'docs', 'sdd', 'runbooks', 'rb-05-tenant-onboarding.md');
if (!existsSync(rb05)) {
  console.error('FAIL RB-05 missing');
  failed = true;
}

if (failed) {
  console.error('verify-alerts-runbooks: FAIL');
  process.exit(1);
}
console.log(
  `verify-alerts-runbooks: OK (${map.alerts.length} alerts, ${map.phase1.length} phase1 runbooks)`,
);
