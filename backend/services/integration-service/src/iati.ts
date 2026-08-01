import { createHash } from 'node:crypto';
import { suppressAggregate, type AggregateCell } from '@ngois/k-anonymity';

export type GrantForIati = {
  id: string;
  grant_number: string;
  title: string;
  donor_name: string;
  currency: string;
  total_budget: number | string;
  start_date?: string;
  end_date?: string;
  admin_area_l2?: string | null;
};

export type IatiBuildInput = {
  grant: GrantForIati;
  /** May include forbidden beneficiary-level or small-cohort data — stripped. */
  raw_indicators?: AggregateCell[];
  /** Deliberate PII seed for exclusion tests. */
  forbidden?: {
    beneficiary_names?: string[];
    precise_coordinates?: string[];
    staff_names?: string[];
  };
};

export type IatiDocument = {
  version: '2.03';
  iati_activities: Array<Record<string, unknown>>;
  exclusions_applied: string[];
  checksum: string;
};

const PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:\+211|\+256|\+254)/,
  /\bNID[-:\s]?\d+/i,
];

export function buildIatiActivity(input: IatiBuildInput): IatiDocument {
  const exclusions: string[] = [];
  if (input.forbidden?.beneficiary_names?.length) {
    exclusions.push('beneficiary_level_records');
  }
  if (input.forbidden?.precise_coordinates?.length) {
    exclusions.push('precise_coordinates');
  }
  if (input.forbidden?.staff_names?.length) {
    exclusions.push('staff_names_below_management');
  }

  const cells = input.raw_indicators ?? [];
  const suppressed = cells.length ? suppressAggregate(cells) : null;
  if (suppressed) {
    exclusions.push('k_anonymity_lt_5');
  }

  const title = String(input.grant.title);
  for (const re of PII_PATTERNS) {
    if (re.test(title)) {
      throw new Error('IATI exclusion: PII-shaped content in grant title');
    }
  }

  const activity = {
    'iati-identifier': `NGOIS-${input.grant.grant_number}`,
    title: { narrative: title },
    reporting_org: { narrative: 'NGO Intelligence Suite tenant' },
    activity_status: { code: '2' },
    activity_date: [
      { type: '1', 'iso-date': input.grant.start_date ?? '2026-01-01' },
      { type: '3', 'iso-date': input.grant.end_date ?? '2026-12-31' },
    ],
    recipient_region: {
      vocabulary: '1',
      code: '298',
      narrative: input.grant.admin_area_l2 ?? 'Unity',
    },
    // Location precision capped at admin2 — never precise coordinates
    location: {
      name: input.grant.admin_area_l2 ?? 'Unity',
      exactness: '2',
    },
    budget: {
      value: {
        currency: input.grant.currency,
        amount: String(input.grant.total_budget),
      },
    },
    result: suppressed
      ? {
          title: 'Households reached (k-anonymised)',
          indicator: suppressed.cells
            .filter((c) => !c.suppressed)
            .map((c) => ({
              dimension: `${c.row}/${c.col}`,
              value: c.count,
            })),
          footnote: suppressed.footnote,
          published_total: suppressed.grand_total,
        }
      : undefined,
    // Explicitly never include:
    // beneficiary records, staff contacts, logistics detail
  };

  const doc: IatiDocument = {
    version: '2.03',
    iati_activities: [activity],
    exclusions_applied: [...new Set(exclusions)],
    checksum: '',
  };
  doc.checksum = createHash('sha256').update(JSON.stringify(doc.iati_activities)).digest('hex');
  return doc;
}

export function validateIatiDocument(doc: IatiDocument): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (doc.version !== '2.03') errors.push('version must be 2.03');
  if (!doc.iati_activities?.length) errors.push('no activities');
  for (const a of doc.iati_activities) {
    if (!a['iati-identifier']) errors.push('missing iati-identifier');
    if (!a.title) errors.push('missing title');
    const blob = JSON.stringify(a);
    if (/\bbene(?:ficiary)?_id\b/i.test(blob)) errors.push('beneficiary id leaked');
    if (/-?\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/.test(blob)) {
      errors.push('precise coordinates leaked');
    }
  }
  return { ok: errors.length === 0, errors };
}
