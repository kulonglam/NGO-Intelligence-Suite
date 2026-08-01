/**
 * Phase 3 full e2e — LMS + notifications + device wipe + k-anonymity.
 *
 *   npm run smoke:phase3-e2e
 */
import { randomUUID } from 'node:crypto';

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
    throw new Error(`${method} ${path} → ${res.status}: ${json.errors?.[0]?.message ?? JSON.stringify(json)}`);
  }
  return json.data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

await waitFor(`${GATEWAY}/v1/health`);
const login = await api('/v1/auth/dev/login', {
  method: 'POST',
  body: { email: EMAIL, password: PASSWORD },
});
const token = login.access_token ?? login.token;
const userId = login.user?.id ?? login.user_id;

console.log('1. LMS courses…');
const courses = await api('/v1/lms/courses', { token });
assert(courses.length >= 1, 'seeded SAFEGUARD course');
const course = courses.find((c) => c.code === 'SAFEGUARD-101') ?? courses[0];
assert(course.is_published || course.current_version_id, 'published course');

const employeeId = randomUUID();
console.log('2. HR onboard → enrollments…');
const onboard = await api('/v1/lms/hr/onboarded', {
  method: 'POST',
  token,
  body: { employee_id: employeeId, user_id: userId, position: 'field_officer' },
});
assert(onboard.enrollments?.length >= 1, 'mandatory enrollments');
const enrollmentId = onboard.enrollments[0].id;
const courseVersionId = onboard.enrollments[0].course_version_id;

// Fetch lesson via creating progress — need lesson id from seed
const lessonId = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
const assessmentId = 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4';
const questionId = 'c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5';
const optTrueId = 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6';

console.log('3. Progress + assessment…');
await api(`/v1/lms/enrollments/${enrollmentId}/progress`, {
  method: 'POST',
  token,
  body: { lesson_id: lessonId, time_spent_seconds: 120 },
});
const attempt = await api(`/v1/lms/assessments/${assessmentId}/attempts`, {
  method: 'POST',
  token,
  body: {
    enrollment_id: enrollmentId,
    answers: [{ question_id: questionId, option_id: optTrueId }],
  },
});
assert(attempt.passed === true, 'assessment passed');
assert(attempt.certificate?.certificate_number, 'certificate issued');

console.log('4. Notification send + SMS fallback…');
const emailSend = await api('/v1/notifications/send', {
  method: 'POST',
  token,
  body: {
    template_code: 'payslip_ready',
    channel: 'email',
    recipient_address: 'officer@example.com',
    vars: { ref: 'PS-1' },
    dedupe_key: `payslip-${randomUUID()}`,
  },
});
assert(emailSend.status === 'sent', 'email sent');
const fallback = await api('/v1/notifications/send', {
  method: 'POST',
  token,
  body: {
    template_code: 'sync_alert',
    channel: 'email',
    recipient_address: '+211900000001',
    vars: { ref: 'SYNC-1' },
    force_fail_email: true,
    dedupe_key: `sync-fail-${randomUUID()}`,
  },
});
assert(fallback.fallback?.status === 'sent' || fallback.circuit_open === true, 'SMS fallback');

console.log('5. Device wipe…');
const deviceId = `smoke-${randomUUID()}`;
await api('/v1/field-data/devices/register', {
  method: 'POST',
  token,
  body: { device_id: deviceId, label: 'smoke' },
});
await api(`/v1/field-data/devices/${deviceId}/wipe`, { method: 'POST', token });
const me = await api(`/v1/field-data/devices/me?device_id=${encodeURIComponent(deviceId)}`, {
  token,
});
assert(me.wipe === true, 'wipe pending');
await api('/v1/field-data/devices/me/wipe-ack', {
  method: 'POST',
  token,
  body: { device_id: deviceId },
});

console.log('6. k-anonymity Koch fixture…');
const agg = await api('/v1/beneficiary/aggregates/publish-preview', {
  method: 'POST',
  token,
  body: { use_fixture: true },
});
assert(agg.grand_total === 1083, `grand_total ${agg.grand_total}`);
assert(agg.row_totals.Koch === null, 'Koch row suppressed');

console.log('7. Compliance status…');
const compliance = await api('/v1/lms/compliance-status', { token });
assert(typeof compliance.mandatory_total === 'number', 'compliance');

void courseVersionId;
console.log('\nsmoke:phase3-e2e PASS');
