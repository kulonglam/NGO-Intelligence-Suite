/**
 * Inventory gate for platform stubs (SDD §31.3.1 platform / ops baseline).
 * Does not apply Terraform or talk to a cluster.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');

const required = [
  'infra/README.md',
  'infra/terraform/envs/dev/main.tf',
  'infra/terraform/envs/staging/main.tf',
  'infra/terraform/envs/prod/main.tf',
  'infra/terraform/envs/dr/main.tf',
  'infra/terraform/modules/gke/main.tf',
  'infra/terraform/modules/cloudsql/main.tf',
  'infra/terraform/modules/redis/main.tf',
  'infra/terraform/modules/networking/main.tf',
  'infra/terraform/modules/kms/main.tf',
  'infra/kubernetes/base/namespace.yaml',
  'infra/kubernetes/argo/root-app.yaml',
  'infra/observability/otel-collector-config.yaml',
  'infra/observability/prometheus/prometheus.yml',
  'infra/observability/prometheus/rules/phase1-alerts.yaml',
  'infra/observability/loki/loki-config.yaml',
  'infra/supply-chain/README.md',
  'ops/README.md',
  'ops/on-call.md',
  'ops/incident-process.md',
  'ops/alert-runbook-map.yaml',
  'ops/drills/backup-restore.md',
  'ops/drills/regional-failover.md',
  'ops/phase1-gate-status.md',
  'infra/kubernetes/canary/rollout-stub.yaml',
  'infra/pgbouncer/pgbouncer.ini',
];

const dashboards = join(root, 'infra', 'observability', 'grafana', 'dashboards');
const services = [
  'api-gateway',
  'auth-service',
  'grant-service',
  'file-service',
  'tenant-service',
  'outbox-relay',
];

let failed = false;
for (const rel of required) {
  const abs = join(root, ...rel.split('/'));
  if (!existsSync(abs)) {
    console.error(`MISSING ${rel}`);
    failed = true;
  } else {
    console.log(`OK   ${rel}`);
  }
}

const dashFiles = existsSync(dashboards)
  ? readdirSync(dashboards).filter((f) => f.endsWith('.json'))
  : [];
if (dashFiles.length < 6) {
  console.error(`FAIL expected ≥6 grafana dashboards, got ${dashFiles.length}`);
  failed = true;
} else {
  console.log(`OK   grafana dashboards (${dashFiles.length})`);
}

for (const s of services) {
  const abs = join(root, 'infra', 'kubernetes', 'apps', s, 'deployment.yaml');
  if (!existsSync(abs)) {
    console.error(`MISSING k8s app ${s}`);
    failed = true;
  } else {
    console.log(`OK   k8s/${s}`);
  }
}

if (failed) {
  console.error('verify-platform: FAIL');
  process.exit(1);
}
console.log('verify-platform: OK (stubs present)');
