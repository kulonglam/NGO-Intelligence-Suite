/**
 * Documents live vs stub provider env without requiring secrets.
 * Writes ops/drills/evidence/providers-env.json for gate prep.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const envExample = existsSync(join(root, '.env.example'))
  ? readFileSync(join(root, '.env.example'), 'utf8')
  : '';

const providers = [
  {
    id: 'auth',
    modeVar: 'AUTH_MODE',
    liveWhen: (env) => env.AUTH_MODE === 'oidc' && Boolean(env.OIDC_ISSUER && env.OIDC_CLIENT_ID),
    stubWhen: (env) =>
      env.AUTH_MODE !== 'oidc' || env.OIDC_STUB === 'true' || env.OIDC_STUB === '1',
    docKeys: ['AUTH_MODE', 'OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_STUB'],
  },
  {
    id: 'notify',
    modeVar: 'NOTIFY_PROVIDER',
    liveWhen: (env) =>
      env.NOTIFY_PROVIDER === 'sendgrid' || env.NOTIFY_PROVIDER === 'africas_talking',
    stubWhen: (env) => !env.NOTIFY_PROVIDER || env.NOTIFY_PROVIDER === 'local',
    docKeys: ['NOTIFY_PROVIDER', 'SENDGRID_API_KEY', 'AT_API_KEY', 'AT_USERNAME'],
  },
  {
    id: 'ai_llm',
    modeVar: 'AI_LLM_PROVIDER',
    liveWhen: (env) =>
      env.AI_LLM_PROVIDER === 'openai' || env.AI_LLM_PROVIDER === 'anthropic',
    stubWhen: (env) => !env.AI_LLM_PROVIDER || env.AI_LLM_PROVIDER === 'local',
    docKeys: ['AI_LLM_PROVIDER', 'AI_LLM_API_KEY', 'AI_LLM_MODEL', 'AI_LLM_BASE_URL'],
  },
  {
    id: 'iati',
    modeVar: 'IATI_REGISTRY_MODE',
    liveWhen: (env) => env.IATI_REGISTRY_MODE === 'remote',
    stubWhen: (env) => !env.IATI_REGISTRY_MODE || env.IATI_REGISTRY_MODE === 'local',
    docKeys: ['IATI_REGISTRY_MODE', 'IATI_REGISTRY_TOKEN', 'IATI_REGISTRY_URL'],
  },
];

const env = process.env;
const report = providers.map((p) => {
  const documented = p.docKeys.every((k) => envExample.includes(k));
  const mode = env[p.modeVar] ?? 'default';
  const live = p.liveWhen(env);
  const stub = p.stubWhen(env);
  return {
    id: p.id,
    modeVar: p.modeVar,
    mode,
    live,
    stub,
    documented_in_env_example: documented,
  };
});

const evidence = {
  at: new Date().toISOString(),
  providers: report,
  all_documented: report.every((r) => r.documented_in_env_example),
  any_live: report.some((r) => r.live),
  note: 'Inventory only — does not call external APIs',
};

writeFileSync(join(evidenceDir, 'providers-env.json'), JSON.stringify(evidence, null, 2));

let failed = 0;
for (const row of report) {
  if (!row.documented_in_env_example) {
    console.error(`FAIL provider ${row.id} — missing keys in .env.example`);
    failed += 1;
  } else {
    console.log(
      `OK   ${row.id} mode=${row.mode} live=${row.live} stub=${row.stub}`,
    );
  }
}

if (failed) process.exit(1);
console.log('check:providers-env OK');
