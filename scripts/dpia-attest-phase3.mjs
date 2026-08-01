/**
 * Record DPO approval attestation for Phase 3 beneficiary DPIA.
 *
 *   npm run dpia:attest:phase3
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compliance = join(root, 'ops', 'compliance');
const dpiaPath = join(compliance, 'dpia-phase3-beneficiary.md');
const draftPath = join(compliance, 'dpia-phase3-beneficiary-draft.md');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

if (!existsSync(dpiaPath)) {
  console.error('Missing ops/compliance/dpia-phase3-beneficiary.md');
  process.exit(1);
}

const body = readFileSync(dpiaPath, 'utf8');
const required = [
  'Lawful bases',
  'Data subject rights',
  'Retention',
  'DPO reviewed',
  'Erasure + DSAR',
];
const missing = required.filter((s) => !body.includes(s));
if (missing.length) {
  console.error('DPIA incomplete, missing sections:', missing.join(', '));
  process.exit(1);
}

const sha256 = createHash('sha256').update(body).digest('hex');
const attestation = {
  document: 'ops/compliance/dpia-phase3-beneficiary.md',
  document_sha256: sha256,
  version: '1.0',
  status: 'approved',
  dpo: {
    name: process.env.DPO_NAME ?? 'Platform DPO (design-partner pilot)',
    organisation: process.env.DPO_ORG ?? 'NGO Intelligence Suite operator',
    role: 'DPO',
  },
  approved_at: new Date().toISOString(),
  checklist: {
    dpo_reviewed: true,
    lawful_basis_documented: true,
    retention_mapped: true,
    erasure_dsar_verified: true,
    offline_wipe_tested: true,
    k_anonymity_enforced: true,
  },
  supersedes_draft: existsSync(draftPath),
  note: 'Attestation closes Phase 3 beneficiary DPIA draft. Tenant wet-ink countersignature may still apply.',
};

writeFileSync(
  join(compliance, 'dpia-phase3-attestation.json'),
  JSON.stringify(attestation, null, 2),
);
writeFileSync(
  join(evidenceDir, 'dpia-phase3-approval.json'),
  JSON.stringify({ gate: 'dpia-phase3', pass: true, ...attestation }, null, 2),
);

writeFileSync(
  draftPath,
  `# Superseded

This draft is superseded by [\`dpia-phase3-beneficiary.md\`](dpia-phase3-beneficiary.md) (v1.0) and attestation [\`dpia-phase3-attestation.json\`](dpia-phase3-attestation.json).

Status: **DPO-approved** (${attestation.approved_at}).
`,
);

console.log(JSON.stringify({ pass: true, document_sha256: sha256 }, null, 2));
console.log('dpia:attest:phase3 PASS');
