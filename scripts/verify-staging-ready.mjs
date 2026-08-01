/**
 * Inventory gate for staging-ready Terraform / Rollouts / provider hooks.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
let failed = false;

const required = [
  'infra/terraform/modules/networking/main.tf',
  'infra/terraform/modules/gke/main.tf',
  'infra/terraform/modules/cloudsql/main.tf',
  'infra/terraform/modules/redis/main.tf',
  'infra/terraform/modules/kms/main.tf',
  'infra/terraform/envs/staging/terraform.tfvars.example',
  'infra/kubernetes/canary/api-gateway-rollout.yaml',
  'infra/kubernetes/canary/analysis-template.yaml',
  'infra/kubernetes/canary/kustomization.yaml',
  'ops/staging-ready.md',
  'scripts/smoke-staging-checklist.mjs',
  'frontend/src/layouts/AppShell.vue',
  'frontend/src/components/layout/PageHeader.vue',
  'frontend/src/components/data/DataTable.vue',
  'backend/services/ai-insights-service/src/llm.ts',
  'backend/services/notification-service/src/adapters.ts',
  'backend/services/auth-service/src/index.ts',
  'backend/services/integration-service/src/index.ts',
];

for (const rel of required) {
  const abs = join(root, ...rel.split('/'));
  if (!existsSync(abs)) {
    console.error(`MISSING ${rel}`);
    failed = true;
  } else console.log(`OK   ${rel}`);
}

function mustContain(rel, needle) {
  const text = readFileSync(join(root, ...rel.split('/')), 'utf8');
  if (!text.includes(needle)) {
    console.error(`FAIL ${rel} missing ${needle}`);
    failed = true;
  } else console.log(`OK   ${rel} contains ${needle}`);
}

mustContain('infra/terraform/modules/gke/main.tf', 'google_container_cluster');
mustContain('infra/terraform/modules/gke/main.tf', 'enable_resources');
mustContain('infra/terraform/modules/cloudsql/main.tf', 'google_sql_database_instance');
mustContain('infra/kubernetes/canary/api-gateway-rollout.yaml', 'kind: Rollout');
mustContain('backend/services/ai-insights-service/src/llm.ts', 'createLlmAdapter');
mustContain('backend/services/notification-service/src/adapters.ts', 'SENDGRID_API_KEY');
mustContain('backend/services/auth-service/src/index.ts', '/v1/auth/oidc/start');
mustContain('backend/services/integration-service/src/index.ts', 'IATI_REGISTRY_MODE');
mustContain('ops/staging-ready.md', 'ENABLE_RESOURCES_APPLY');
mustContain('frontend/src/lib/nav.ts', 'nav.programmes');
mustContain('frontend/src/layouts/AppShell.vue', 'NAV_GROUPS');

if (failed) {
  console.error('verify:staging-ready FAIL');
  process.exit(1);
}
console.log('verify:staging-ready OK');
