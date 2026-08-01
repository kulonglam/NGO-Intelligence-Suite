/**
 * Phase 3 field e2e — beneficiary + form batch + idempotent replay + sync manifest.
 *
 *   npm run smoke:field-e2e
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

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${GATEWAY}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    const msg = json.errors?.[0]?.message ?? JSON.stringify(json);
    const err = new Error(`${method} ${path} → ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return { status: res.status, data: json.data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('Waiting for gateway…');
await waitFor(`${GATEWAY}/v1/health`);

console.log('1. Login…');
const login = await api('/v1/auth/dev/login', {
  method: 'POST',
  body: { email: EMAIL, password: PASSWORD },
});
const token = login.data.access_token ?? login.data.token;
assert(token, 'no token');

console.log('2. Create household + beneficiary…');
const hh = await api('/v1/beneficiary/households', {
  method: 'POST',
  token,
  body: {
    household_code: `HH-S${Date.now().toString().slice(-6)}`,
    settlement: 'Bentiu',
    admin_area: 'Unity',
    shelter_type: 'temporary',
  },
});
const ben = await api('/v1/beneficiary/beneficiaries', {
  method: 'POST',
  token,
  body: {
    first_name: 'Nyandeng',
    last_name: 'Deng',
    household_id: hh.data.id,
    sex: 'F',
    birth_year: 1990,
    admin_area: 'Unity',
    national_id: `NID-${Date.now()}`,
  },
});
assert(ben.data.beneficiary_number?.startsWith('BEN-'), 'beneficiary number');
console.log(`   OK ${ben.data.beneficiary_number}`);

console.log('3. Duplicate search (no auto-merge)…');
const dups = await api('/v1/beneficiary/beneficiaries/search-duplicates', {
  method: 'POST',
  token,
  body: {
    first_name: 'Nyandeng',
    last_name: 'Deng',
    national_id: ben.data.national_id ?? undefined,
  },
});
assert(dups.data.auto_merge === false, 'must never auto-merge');

console.log('4. Vulnerability assessment…');
const assess = await api(`/v1/beneficiary/beneficiaries/${ben.data.id}/assessments`, {
  method: 'POST',
  token,
  body: {
    dependents: 5,
    working_age: 2,
    monthly_income: 90000,
    members: 7,
    need_threshold_per_member: 22000,
    shelter: 'temporary',
    rcsi: 22,
    displacement: 'displaced_lt_12m',
    disability_count: 1,
    chronic_illness_count: 1,
    under5_malnutrition_count: 0,
    headship: 'female_with_deps',
    household_id: hh.data.id,
  },
});
assert(assess.data.score === 79 && assess.data.band === 'Severe', 'Bentiu score');

console.log('5. Assigned forms + batch submit + idempotent replay…');
const forms = await api('/v1/field-data/forms/assigned', { token });
assert(forms.data.length >= 1, 'expected seeded HH-REG form');
const formVersionId = forms.data[0].form_version_id;
const clientUuid = crypto.randomUUID();
const batch1 = await api('/v1/field-data/submissions/batch', {
  method: 'POST',
  token,
  body: {
    submissions: [
      {
        client_uuid: clientUuid,
        form_version_id: formVersionId,
        captured_at: new Date().toISOString(),
        beneficiary_id: ben.data.id,
        payload: { settlement: 'Bentiu', household_size: '7' },
      },
    ],
  },
});
assert(batch1.data.results[0].status === 'accepted', 'first accept');
const batch2 = await api('/v1/field-data/submissions/batch', {
  method: 'POST',
  token,
  body: {
    submissions: [
      {
        client_uuid: clientUuid,
        form_version_id: formVersionId,
        captured_at: new Date().toISOString(),
        payload: { settlement: 'Bentiu', household_size: '7' },
      },
    ],
  },
});
assert(batch2.data.results[0].status === 'idempotent_replay', 'replay');

console.log('6. Sync manifest + complete…');
const manifest = await api('/v1/field-data/sync/manifest', { token });
assert(manifest.data.session_id && manifest.data.cursor, 'manifest');
await api('/v1/field-data/sync/complete', {
  method: 'POST',
  token,
  body: { session_id: manifest.data.session_id, cursor: manifest.data.cursor },
});

console.log('\nsmoke:field-e2e PASS');
