/**
 * Drain report queue with round-robin claim until empty.
 * Usage: node scripts/reporting-worker.mjs
 */
const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.SMOKE_HR_EMAIL ?? 'admin@design-partner.example';
const PASSWORD = process.env.SMOKE_HR_PASSWORD ?? 'changeme';

const login = await fetch(`${GATEWAY}/v1/auth/dev/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());
const token = login.data?.access_token;
if (!token) throw new Error('login failed');

let n = 0;
for (let i = 0; i < 50; i++) {
  const res = await fetch(`${GATEWAY}/v1/reporting/jobs/claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.errors?.[0]?.message ?? 'claim failed');
  if (!body.data?.claimed) break;
  console.log('claimed', body.data.claimed, body.data.status);
  n += 1;
}
console.log(`reporting-worker done; processed=${n}`);
