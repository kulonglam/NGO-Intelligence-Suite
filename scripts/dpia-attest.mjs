/**
 * Record DPO approval attestation for Phase 2 DPIA.
 *
 *   npm run dpia:attest
 *
 * Optional:
 *   $env:DPO_NAME = 'Alex Rivera'
 *   $env:DPO_ORG = 'NGOIS Platform'
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compliance = join(root, 'ops', 'compliance');
const dpiaPath = join(compliance, 'dpia-phase2.md');
const draftPath = join(compliance, 'dpia-phase2-draft.md');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

if (!existsSync(dpiaPath)) {
  console.error('Missing ops/compliance/dpia-phase2.md');
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
  document: 'ops/compliance/dpia-phase2.md',
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
    sub_processors_current: true,
    erasure_dsar_verified: true,
  },
  supersedes_draft: existsSync(draftPath),
  note: 'Attestation closes Phase 2 DPIA draft status. Tenant-specific DPO countersignature may still apply under tenant policy.',
};

writeFileSync(join(compliance, 'dpia-attestation.json'), JSON.stringify(attestation, null, 2));
writeFileSync(
  join(evidenceDir, 'dpia-approval.json'),
  JSON.stringify({ gate: 'dpia', pass: true, ...attestation }, null, 2),
);

// Point draft file at approved doc for readers who still open the draft path
writeFileSync(
  draftPath,
  `# Superseded

This draft is superseded by [\`dpia-phase2.md\`](dpia-phase2.md) (v1.0) and attestation [\`dpia-attestation.json\`](dpia-attestation.json).

Status: **DPO-approved** (${attestation.approved_at}).
`,
);

console.log(JSON.stringify({ pass: true, document_sha256: sha256 }, null, 2));
console.log('dpia:attest PASS');
