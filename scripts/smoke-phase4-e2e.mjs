/**
 * Phase 4 e2e — analytics, AI HITL, kill switch, budget, IATI.
 *
 *   npm run smoke:phase4-e2e
 */
const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@design-partner.example';
const PASSWORD = process.env.SMOKE_HR_PASSWORD ?? 'changeme';

async function waitFor(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 401 || res.status === 404) return;
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function api(path, { method = 'GET', token, body, allowStatus } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${GATEWAY}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (allowStatus && allowStatus.includes(res.status)) {
    return { status: res.status, data: json.data, errors: json.errors };
  }
  if (!res.ok || json.success === false) {
    throw new Error(
      `${method} ${path} → ${res.status}: ${json.errors?.[0]?.message ?? JSON.stringify(json)}`,
    );
  }
  return { status: res.status, data: json.data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

await waitFor(`${GATEWAY}/v1/health`);
const login = await api('/v1/auth/dev/login', {
  method: 'POST',
  body: { email: EMAIL, password: PASSWORD },
});
const token = login.data.access_token ?? login.data.token;

console.log('1. Dashboard + KPI refresh…');
await api('/v1/analytics/kpis/refresh', { method: 'POST', token, body: {} });
const dash = await api('/v1/analytics/dashboard', { token });
assert(dash.data.as_of, 'as_of');
assert(Array.isArray(dash.data.kpis), 'kpis');

console.log('2. k-anon aggregate preview…');
const agg = await api('/v1/analytics/aggregates/preview', {
  method: 'POST',
  token,
  body: { use_fixture: true },
});
assert(agg.data.grand_total === 1083, 'koch total');

console.log('3. AI generate + approve…');
await api('/v1/ai/settings', {
  method: 'POST',
  token,
  body: { ai_enabled: true, monthly_token_budget: 100000 },
});
const gen = await api('/v1/ai/insights/generate', {
  method: 'POST',
  token,
  body: { use_case: 'grant_narrative' },
});
assert(gen.data.approval_status === 'unapproved', 'unapproved');
const approved = await api(`/v1/ai/insights/${gen.data.id}/approve`, {
  method: 'POST',
  token,
  body: { attest_verbatim: true },
});
assert(approved.data.approval_status === 'approved', 'approved');

console.log('4. Kill switch…');
await api('/v1/ai/settings', { method: 'POST', token, body: { ai_enabled: false } });
const killed = await api('/v1/ai/insights/generate', {
  method: 'POST',
  token,
  body: { use_case: 'grant_narrative' },
  allowStatus: [503],
});
assert(killed.status === 503, 'kill switch 503');
await api('/v1/ai/settings', { method: 'POST', token, body: { ai_enabled: true } });

console.log('5. Budget exhaustion…');
await api('/v1/ai/settings', {
  method: 'POST',
  token,
  body: { monthly_token_budget: 1 },
});
// burn remaining by setting usage high via generate until 429
let budgetHit = false;
for (let i = 0; i < 5; i++) {
  const r = await api('/v1/ai/insights/generate', {
    method: 'POST',
    token,
    body: { use_case: 'grant_narrative' },
    allowStatus: [429, 201],
  });
  if (r.status === 429) {
    budgetHit = true;
    break;
  }
}
assert(budgetHit, 'expected budget exhaustion');
await api('/v1/ai/settings', {
  method: 'POST',
  token,
  body: { monthly_token_budget: 100000 },
});

console.log('6. IATI preview/publish with PII seed excluded…');
const preview = await api('/v1/integrations/iati/preview', {
  method: 'POST',
  token,
  body: { include_pii_seed: true, use_koch_indicators: true },
});
assert(preview.data.document.exclusions_applied.includes('beneficiary_level_records'), 'excl');
const pub = await api('/v1/integrations/iati/publish', {
  method: 'POST',
  token,
  body: { include_pii_seed: true, use_koch_indicators: true },
});
assert(pub.data.status === 'published_local', 'published_local');

console.log('7. Compliance score…');
const score = await api('/v1/analytics/compliance-score', { token });
assert(typeof score.data.score === 'number', 'score');

console.log('\nsmoke:phase4-e2e PASS');
