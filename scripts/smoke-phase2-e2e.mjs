/**
 * Phase 2 §31.4 e2e smoke — leave accrue, finance COA/expense/BvA,
 * reporting queue, quotas, erasure dry-path (tombstone employee).
 *
 * Prerequisites: migrated+seeded DB; gateway + auth + hr + grant + reporting + tenant running.
 *
 *   npm run smoke:phase2-e2e
 */
const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000';
const HR_EMAIL = process.env.SMOKE_HR_EMAIL ?? 'hr@design-partner.example';
const FINANCE_EMAIL = process.env.SMOKE_FINANCE_EMAIL ?? 'finance@design-partner.example';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@design-partner.example';
const PASSWORD = process.env.SMOKE_HR_PASSWORD ?? 'changeme';

async function waitFor(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 401 || res.status === 404) return;
    } catch {
      /* retry */
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
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} → ${res.status}: non-JSON (${text.slice(0, 200)})`);
  }
  if (!res.ok || json.success === false) {
    const msg = json.errors?.[0]?.message ?? JSON.stringify(json);
    const err = new Error(`${method} ${path} → ${res.status}: ${msg}`);
    err.status = res.status;
    err.code = json.errors?.[0]?.code;
    throw err;
  }
  return { status: res.status, data: json.data, raw: json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function login(email) {
  const r = await api('/v1/auth/dev/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  const token = r.data.access_token ?? r.data.token;
  assert(token, `No token for ${email}`);
  return { token, user: r.data.user };
}

console.log('Waiting for gateway…');
await waitFor(`${GATEWAY}/v1/health`);

console.log('1. Login HR / finance / admin…');
const hr = await login(HR_EMAIL);
const fin = await login(FINANCE_EMAIL);
const admin = await login(ADMIN_EMAIL);
console.log('   OK');

console.log('2. Leave accrue…');
const now = new Date();
const period = {
  period_year: now.getFullYear(),
  period_month: ((now.getMonth() + Math.floor(Math.random() * 11)) % 12) + 1,
};
try {
  const accrue = await api('/v1/hr/leave/accrue', {
    method: 'POST',
    token: hr.token,
    body: period,
  });
  assert(accrue.data.run_id || accrue.data.employees_accrued >= 0, 'Accrue payload');
  console.log(`   OK period ${period.period_year}-${period.period_month}`);
} catch (err) {
  if (err.code === 'NGOIS-HR-0110' || err.status === 409) {
    console.log('   OK (already accrued for period)');
  } else throw err;
}
const bals = await api('/v1/hr/leave-balances', { token: hr.token });
assert(Array.isArray(bals.data), 'Expected leave balances array');
console.log(`   OK ${bals.data.length} balance row(s)`);

console.log('3. COA + expense maker-checker + BvA…');
const code = `E${Date.now().toString().slice(-6)}`;
let accountId;
const existingCoa = await api('/v1/grant/coa', { token: fin.token });
if (existingCoa.data?.length) {
  accountId = existingCoa.data[0].id;
} else {
  const created = await api('/v1/grant/coa', {
    method: 'POST',
    token: fin.token,
    body: { account_code: code, name: 'Smoke expense acct', account_type: 'expense' },
  });
  accountId = created.data.id;
}
const grants = await api('/v1/grant/grants', { token: fin.token });
assert(grants.data?.length >= 1, 'Expected grant');
const expNum = `EXP-S${Date.now().toString().slice(-8)}`;
const expense = await api('/v1/grant/expenses', {
  method: 'POST',
  token: fin.token,
  body: {
    grant_id: grants.data[0].id,
    account_id: accountId,
    expense_number: expNum,
    description: 'Phase 2 smoke expense',
    amount: '100.00',
    currency: 'USD',
    expense_date: '2026-07-01',
  },
});
await api(`/v1/grant/expenses/${expense.data.id}/submit`, { method: 'POST', token: fin.token });
const approved = await api(`/v1/grant/expenses/${expense.data.id}/approve`, {
  method: 'POST',
  token: admin.token,
});
assert(approved.data.status === 'approved', 'Expense not approved');
const bva = await api('/v1/grant/reports/budget-vs-actual', { token: fin.token });
assert(Array.isArray(bva.data.grants), 'BvA grants missing');
console.log(`   OK expense ${expNum} + BvA ${bva.data.grants.length} grant(s)`);

console.log('4. Reporting enqueue + claim…');
const job = await api('/v1/reporting/jobs', {
  method: 'POST',
  token: hr.token,
  body: { job_type: 'leave_balances', formats: ['csv', 'xlsx'] },
});
assert(job.data.job_id, 'No job_id');
const claimed = await api('/v1/reporting/jobs/claim', { method: 'POST', token: admin.token });
assert(
  claimed.data?.claimed === job.data.job_id ||
    claimed.data?.claimed === null ||
    typeof claimed.data?.claimed === 'string',
  'Claim response unexpected',
);
console.log(`   OK job ${job.data.job_id} claim=${claimed.data?.claimed ?? 'none'}`);

console.log('5. Tenant quotas…');
const quotas = await api('/v1/tenant/quotas', { token: admin.token });
assert(quotas.data?.api_rpm >= 1 || Array.isArray(quotas.data), 'Quotas missing');
console.log(`   OK quotas ${JSON.stringify(quotas.data).slice(0, 80)}…`);

if (process.env.SMOKE_QUOTA_429 === '1') {
  console.log('5b. Quota 429 (requires gateway GATEWAY_TENANT_RPM=2)…');
  let saw429 = false;
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`${GATEWAY}/v1/tenant/quotas`, {
      headers: { Authorization: `Bearer ${admin.token}`, Accept: 'application/json' },
    });
    if (res.status === 429) {
      saw429 = true;
      break;
    }
  }
  assert(saw429, 'Expected NGOIS-API-0429 with low GATEWAY_TENANT_RPM');
  console.log('   OK 429');
}

console.log('6. Erasure create → approve → execute…');
const employees = await api('/v1/hr/employees', { token: hr.token });
const subject =
  employees.data.find((e) => String(e.employee_number || '').startsWith('EMP-S')) ??
  employees.data.at(-1);
assert(subject?.id, 'No employee for erasure');
const erasure = await api('/v1/tenant/erasure-requests', {
  method: 'POST',
  token: hr.token,
  body: {
    subject_type: 'employee',
    subject_id: subject.id,
    verification_method: 'staff_attestation',
    reason: 'phase2-smoke',
  },
});
await api(`/v1/tenant/erasure-requests/${erasure.data.id}/approve`, {
  method: 'POST',
  token: admin.token,
});
const executed = await api(`/v1/tenant/erasure-requests/${erasure.data.id}/execute`, {
  method: 'POST',
  token: admin.token,
});
assert(executed.data.status === 'executed' || executed.data.executed_at, 'Erasure not executed');
console.log(`   OK erasure ${erasure.data.id}`);

console.log('\nsmoke:phase2-e2e PASS');
