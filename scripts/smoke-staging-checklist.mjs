/**
 * Asserts ops/staging-ready.md checklist sections + provider env *names* in .env.example.
 * Does not call live GCP or require secrets.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = join(root, 'ops', 'staging-ready.md');
const envPath = join(root, '.env.example');

const MARKERS = [
  'ENABLE_RESOURCES_APPLY',
  'ARGO_CANARY_SYNC',
  'PROVIDER_ENV_FLAGS',
  'STAGING_SMOKE_MATRIX',
  'Phase 1 #2',
  'Phase 1 #12',
];

const ENV_NAMES = [
  'SENDGRID_API_KEY',
  'AT_API_KEY',
  'AT_USERNAME',
  'AI_LLM_PROVIDER',
  'AI_LLM_API_KEY',
  'AUTH_MODE',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'IATI_REGISTRY_MODE',
  'IATI_REGISTRY_TOKEN',
  'NOTIFY_PROVIDER',
];

let failed = 0;

function ok(msg) {
  console.log(`OK   ${msg}`);
}
function bad(msg) {
  console.error(`FAIL ${msg}`);
  failed += 1;
}

if (!existsSync(mdPath)) {
  bad('ops/staging-ready.md missing');
} else {
  const md = readFileSync(mdPath, 'utf8');
  for (const m of MARKERS) {
    if (md.includes(m)) ok(`checklist marker: ${m}`);
    else bad(`checklist marker missing: ${m}`);
  }
  for (const section of [
    '### 0. Prerequisites',
    '### 1. Terraform',
    '### 2. Argo CD',
    '### 3. Provider env',
    '### 4. Smoke matrix',
    '### 5. Remains BLOCKED',
  ]) {
    if (md.includes(section)) ok(`section ${section}`);
    else bad(`section missing: ${section}`);
  }
}

if (!existsSync(envPath)) {
  bad('.env.example missing');
} else {
  const env = readFileSync(envPath, 'utf8');
  for (const name of ENV_NAMES) {
    if (env.includes(name)) ok(`.env.example documents ${name}`);
    else bad(`.env.example missing ${name}`);
  }
}

if (failed) {
  console.error(`smoke:staging-checklist FAILED (${failed})`);
  process.exit(1);
}
console.log('smoke:staging-checklist OK');
