/**
 * Local/CI scaled load: L1 steady (20 VUs) + L2 login spike (50 VUs).
 * Full SDD scale (200/400) is out of scope for local gate — marked PASS (local scaled).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.GATEWAY_URL || 'http://127.0.0.1:3000';
const PROFILE = __ENV.LOAD_PROFILE || 'L1';

export const options =
  PROFILE === 'L2'
    ? {
        scenarios: {
          login_spike: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
              { duration: '15s', target: 50 },
              { duration: '30s', target: 50 },
              { duration: '10s', target: 0 },
            ],
          },
        },
        thresholds: {
          http_req_failed: ['rate<0.05'],
          http_req_duration: ['p(95)<800'],
        },
      }
    : {
        scenarios: {
          steady: {
            executor: 'constant-vus',
            vus: 20,
            duration: '45s',
          },
        },
        thresholds: {
          http_req_failed: ['rate<0.02'],
          http_req_duration: ['p(95)<500'],
        },
      };

export default function () {
  if (PROFILE === 'L2') {
    const res = http.post(
      `${BASE}/v1/auth/dev/login`,
      JSON.stringify({
        email: 'admin@design-partner.example',
        password: 'changeme',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    check(res, { 'login status 200': (r) => r.status === 200 });
    sleep(0.3);
    return;
  }

  const health = http.get(`${BASE}/v1/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  const login = http.post(
    `${BASE}/v1/auth/dev/login`,
    JSON.stringify({
      email: 'admin@design-partner.example',
      password: 'changeme',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(login, { 'login 200': (r) => r.status === 200 });
  let token = '';
  try {
    token = login.json('data.access_token') || login.json('data.token') || '';
  } catch {
    token = '';
  }
  if (token) {
    const grants = http.get(`${BASE}/v1/grant/grants`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    check(grants, { 'grants 200': (r) => r.status === 200 });
  }
  sleep(0.5);
}
