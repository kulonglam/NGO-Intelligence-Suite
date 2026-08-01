/**
 * Generate 400 adversarial redaction fixtures (SDD §18.5.3).
 *
 *   node scripts/generate-redaction-corpus.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(outDir, { recursive: true });

const fixtures = [];

function add(id, expect, input) {
  fixtures.push({ id, expect, input });
}

const nids = ['NID-12345678', 'NIN:987654321', 'ID 44556677', 'A1234567B'];
const emails = ['a@example.com', 'field.officer@ngo.org', 'x+y@mail.co.ug'];
const coords = ['9.233, 29.800', '-1.2921, 36.8219', '0.3476, 32.5825'];
const banks = ['GB82WEST12345698765432', 'acct:123456789012', 'momo 256700112233'];
const tins = ['TIN-1234567', 'NSSF 998877', 'NSIF:112233'];
const secrets = ['sk-abc123def456ghi789', 'AKIAIOSFODNN7EXAMPLE', 'ghp_abcdefghijklmnopqrstuv'];
const phones = ['+211912345678', '+256701234567', '+254712345678'];

let i = 0;
for (const n of nids) {
  add(`nid-${i++}`, 'fail', {
    structured: { households_reached: 100 },
    free_text: `Registered under ${n}`,
  });
}
for (const e of emails) {
  add(`email-struct-${i++}`, 'fail', {
    structured: { households_reached: 50, contact: e },
  });
}
for (const c of coords) {
  add(`coord-${i++}`, 'fail', {
    structured: { households_reached: 80, location: c },
  });
}
for (const b of banks) {
  add(`bank-${i++}`, 'fail', {
    structured: { households_reached: 90 },
    free_text: `Pay to ${b}`,
  });
}
for (const t of tins) {
  add(`tin-${i++}`, 'fail', {
    structured: { households_reached: 90 },
    free_text: `Tax ref ${t}`,
  });
}
for (const s of secrets) {
  add(`secret-${i++}`, 'fail', {
    structured: { households_reached: 90 },
    free_text: `key ${s}`,
  });
}
for (const p of phones) {
  add(`phone-struct-${i++}`, 'fail', {
    structured: { households_reached: 90, phone: p },
  });
}

for (let n = 1; n < 5; n++) {
  add(`cohort-${n}`, 'fail', { structured: { count_reached: n } });
}

add('class-restricted', 'fail', {
  structured: { households_reached: 100 },
  classification_max: 'restricted',
});
add('bad-view', 'fail', {
  structured: { households_reached: 100 },
  source_view: 'beneficiaries_raw',
});

const admins = ['Rubkona', 'Guit', 'Koch', 'Mayendit', 'Juba', 'Kampala', 'Nairobi'];
for (let n = 0; n < 120; n++) {
  add(`clean-${n}`, 'pass', {
    structured: {
      households_reached: 50 + n * 3,
      admin2: admins[n % admins.length],
      grants_active: 2 + (n % 5),
      burn_rate_pct: 10 + (n % 40),
    },
    source_view: 'analytics_aggregates',
    classification_max: 'internal',
  });
}

while (fixtures.length < 400) {
  const n = fixtures.length;
  if (n % 2 === 0) {
    add(`pad-fail-${n}`, 'fail', {
      structured: { households_reached: 100 },
      free_text: `Beneficiary NID-${10000000 + n} needs follow-up`,
    });
  } else {
    add(`pad-pass-${n}`, 'pass', {
      structured: {
        households_reached: 200 + n,
        admin2: admins[n % admins.length],
        indicator_value: 12.5,
      },
    });
  }
}

const sliced = fixtures.slice(0, 400);
const path = join(outDir, 'ai-redaction-corpus.json');
writeFileSync(path, JSON.stringify(sliced, null, 2));
console.log(`Wrote ${sliced.length} fixtures → ${path}`);
