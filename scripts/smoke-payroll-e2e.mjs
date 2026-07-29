/**
 * Phase 2 payroll + HR e2e smoke (API).
 *
 * Prerequisites: Postgres migrated+seeded; auth, hr, reporting, gateway running.
 *
 *   npm run smoke:payroll-e2e
 */
const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000';
const HR_EMAIL = process.env.SMOKE_HR_EMAIL ?? 'hr@design-partner.example';
const FINANCE_EMAIL = process.env.SMOKE_FINANCE_EMAIL ?? 'finance@design-partner.example';
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
  return { status: res.status, data: json.data };
}

async function download(path, token) {
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { contentType: res.headers.get('content-type'), bytes: buf.length, text: buf.toString('utf8') };
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
  return token;
}

async function createUniqueRun(token) {
  let year = new Date().getFullYear();
  let month = new Date().getMonth() + 1;
  for (let i = 0; i < 24; i++) {
    try {
      const created = await api('/v1/hr/payroll-runs', {
        method: 'POST',
        token,
        body: { period_year: year, period_month: month },
      });
      return created.data;
    } catch (err) {
      if (err.status === 409 || err.code === 'NGOIS-PAY-0042') {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
        continue;
      }
      throw err;
    }
  }
  throw new Error('Could not find a free payroll period');
}

console.log('Waiting for gateway…');
await waitFor(`${GATEWAY}/v1/health`);

console.log('1. Dev login as HR…');
const hrToken = await login(HR_EMAIL);
console.log('   OK HR token');

console.log('2. List employees + departments…');
const employees = await api('/v1/hr/employees', { token: hrToken });
assert(Array.isArray(employees.data) && employees.data.length >= 1, 'Expected seeded employees');
const depts = await api('/v1/hr/departments', { token: hrToken });
assert(depts.data.length >= 1, 'Expected department');
console.log(`   OK ${employees.data.length} employee(s), ${depts.data.length} department(s)`);

console.log('3. Create employee + contract…');
const empNum = `EMP-S${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 30);
const newEmp = await api('/v1/hr/employees', {
  method: 'POST',
  token: hrToken,
  body: {
    employee_number: empNum,
    first_name: 'Smoke',
    last_name: 'Tester',
    payroll_country: 'SS',
    department_id: depts.data[0].id,
    hire_date: '2026-01-15',
  },
});
assert(newEmp.data.id, 'Employee create failed');
const contract = await api('/v1/hr/contracts', {
  method: 'POST',
  token: hrToken,
  body: {
    employee_id: newEmp.data.id,
    contract_number: `CON-S${Date.now().toString().slice(-6)}`,
    start_date: '2026-01-15',
    gross_salary: '25000.00',
    salary_currency: 'SSP',
    allowances: [{ code: 'HOUSING', amount: '2000.00', taxable: true, pensionable: true }],
    status: 'active',
  },
});
assert(contract.data.status === 'active', 'Contract not active');
console.log(`   OK ${empNum} + contract ${contract.data.contract_number}`);

console.log('4. Leave request → approve…');
const leaveTypes = await api('/v1/hr/leave-types', { token: hrToken });
assert(leaveTypes.data.length >= 1, 'Expected leave type (seed ANNUAL)');
const leave = await api('/v1/hr/leave-requests', {
  method: 'POST',
  token: hrToken,
  body: {
    employee_id: employees.data[0].id,
    leave_type_id: leaveTypes.data[0].id,
    start_date: '2026-08-01',
    end_date: '2026-08-03',
    days_requested: 3,
  },
});
const approved = await api(`/v1/hr/leave-requests/${leave.data.id}/approve`, {
  method: 'POST',
  token: hrToken,
});
assert(approved.data.status === 'approved', 'Leave not approved');
console.log(`   OK leave ${leave.data.id} approved`);

console.log('5. FX refresh (finance)…');
const finToken = await login(FINANCE_EMAIL);
const fx = await api('/v1/hr/fx-rates/refresh', {
  method: 'POST',
  token: finToken,
  body: {
    rates: [
      { base_currency: 'USD', quote_currency: 'SSP', rate: '6100.00000000' },
      { base_currency: 'USD', quote_currency: 'UGX', rate: '3850.00000000' },
    ],
  },
});
assert(fx.data.rates?.length === 2, 'FX refresh failed');
console.log(`   OK FX rate_date=${fx.data.rate_date}`);

console.log('6. Create payroll draft run…');
const run = await createUniqueRun(hrToken);
assert(run.id, 'No payroll run id');
console.log(`   OK run ${run.id} ${run.period_year}-${String(run.period_month).padStart(2, '0')}`);

console.log('7. Calculate run…');
const calc = await api(`/v1/hr/payroll-runs/${run.id}/calculate`, { method: 'POST', token: hrToken });
assert(calc.data.employees >= 1, 'Calculate returned unexpected payload');
console.log(`   OK employees=${calc.data.employees} ruleset=${calc.data.ruleset_hash?.slice(0, 12)}…`);

console.log('8. Fetch records…');
const records = await api(`/v1/hr/payroll-runs/${run.id}/records`, { token: hrToken });
assert(records.data.length >= 1, 'Expected payroll records');
console.log(`   OK ${records.data.length} record(s)`);

console.log('9. Submit (HR) → approve (finance)…');
const submitted = await api(`/v1/hr/payroll-runs/${run.id}/submit`, { method: 'POST', token: hrToken });
assert(submitted.data.status === 'pending_approval', `Submit status=${submitted.data.status}`);
const approvedRun = await api(`/v1/hr/payroll-runs/${run.id}/approve`, {
  method: 'POST',
  token: finToken,
});
assert(approvedRun.data.status === 'approved', `Approve status=${approvedRun.data.status}`);
console.log('   OK maker-checker complete');

console.log('10. Export payslips (CSV)…');
const exportJob = await api('/v1/reporting/payslips', {
  method: 'POST',
  token: hrToken,
  body: { payroll_run_id: run.id, formats: ['csv', 'html'] },
});
const jobId = exportJob.data.job_id;
const artifacts = exportJob.data.artifacts ?? [];
assert(artifacts.length >= 1, 'Expected report artifacts');
const csvArt = artifacts.find((a) => a.format === 'csv');
const csv = await download(`/v1/reporting/jobs/${jobId}/artifacts/${csvArt.id}/download`, hrToken);
assert(csv.bytes > 0, 'Empty CSV');
console.log(`   OK CSV ${csv.bytes} bytes`);

console.log('\nsmoke:payroll-e2e PASS');
