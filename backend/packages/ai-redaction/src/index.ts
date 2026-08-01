/** SDD §18.5 — deny-by-default redaction gate for AI egress. */

export type RedactionInput = {
  /** Structured aggregate context only — never row-level person records. */
  structured: Record<string, unknown>;
  free_text?: string | null;
  classification_max?: 'public' | 'internal' | 'confidential' | 'restricted';
  source_view?: string;
  permitted_views?: string[];
};

export type RedactionResult =
  | {
      ok: true;
      cleared: Record<string, unknown>;
      free_text?: string;
      detectors_fired: string[];
    }
  | {
      ok: false;
      code: string;
      reason: string;
      detectors_fired: string[];
    };

const PERMITTED_DEFAULT = [
  'mv_grant_burn_rate',
  'kpi_snapshots',
  'indicator_values',
  'analytics_aggregates',
];

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE =
  /(?:\+211|\+256|\+254|0)[\s-]?(?:\d[\s-]?){8,12}\d/g;
const COORD_RE = /\b-?\d{1,3}\.\d{3,},\s*-?\d{1,3}\.\d{3,}\b/g;
const NATIONAL_ID_RE =
  /\b(?:NIN|NID|ID)[-:\s]?\d{6,14}\b|\b[A-Z]{1,2}\d{6,10}[A-Z]?\b/gi;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const ACCOUNT_RE = /\b(?:acct|account|momo|mm)[-:\s]?\d{8,16}\b/gi;
const TIN_RE = /\b(?:TIN|NSSF|NSIF|SSN)[-:\s]?\d{5,12}\b/gi;
const DOB_RE =
  /\b(?:born|dob|date of birth)[:\s]+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi;
const SECRET_RE =
  /\b(?:sk-|AKIA|ghp_|xox[baprs]-)[A-Za-z0-9\/+=_-]{12,}\b/g;
const NAME_HEURISTIC_RE =
  /\b(?:Mr|Mrs|Ms|Dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g;

const COMMON_NAMES = [
  'nyandeng',
  'deng',
  'okello',
  'nakato',
  'wanjiku',
  'mutoni',
  'james',
  'sarah',
];

function scanText(text: string): { fires: string[]; hardReject: boolean; redacted: string } {
  const fires: string[] = [];
  let hardReject = false;
  let out = text;

  if (SECRET_RE.test(out)) {
    fires.push('secret');
    hardReject = true;
  }
  SECRET_RE.lastIndex = 0;

  if (NATIONAL_ID_RE.test(out)) {
    fires.push('national_id');
    hardReject = true;
  }
  NATIONAL_ID_RE.lastIndex = 0;

  if (IBAN_RE.test(out) || ACCOUNT_RE.test(out)) {
    fires.push('bank_account');
    hardReject = true;
  }
  IBAN_RE.lastIndex = 0;
  ACCOUNT_RE.lastIndex = 0;

  if (TIN_RE.test(out)) {
    fires.push('tax_id');
    hardReject = true;
  }
  TIN_RE.lastIndex = 0;

  if (EMAIL_RE.test(out)) {
    fires.push('email');
    out = out.replace(EMAIL_RE, '[EMAIL]');
  }
  EMAIL_RE.lastIndex = 0;

  if (PHONE_RE.test(out)) {
    fires.push('phone');
    out = out.replace(PHONE_RE, '[PHONE]');
  }
  PHONE_RE.lastIndex = 0;

  if (COORD_RE.test(out)) {
    fires.push('coordinates');
    out = out.replace(COORD_RE, '[ADMIN2]');
  }
  COORD_RE.lastIndex = 0;

  if (DOB_RE.test(out)) {
    fires.push('dob');
    out = out.replace(DOB_RE, '[AGE_BAND]');
  }
  DOB_RE.lastIndex = 0;

  if (NAME_HEURISTIC_RE.test(out)) {
    fires.push('person_name');
    out = out.replace(NAME_HEURISTIC_RE, '[PERSON]');
  }
  NAME_HEURISTIC_RE.lastIndex = 0;

  const lower = out.toLowerCase();
  for (const n of COMMON_NAMES) {
    if (lower.includes(n)) {
      fires.push('person_name');
      const re = new RegExp(`\\b${n}\\b`, 'gi');
      out = out.replace(re, '[PERSON]');
    }
  }

  return { fires: [...new Set(fires)], hardReject, redacted: out };
}

function redactionRatio(original: string, redacted: string): number {
  const tokens = original.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  const placeholders = (redacted.match(/\[[A-Z0-9_]+\]/g) ?? []).length;
  return placeholders / tokens.length;
}

function hasSmallCohort(value: unknown, path = ''): string | null {
  if (typeof value === 'number' && value > 0 && value < 5 && /count|total|reached|n_/i.test(path)) {
    return path || 'count';
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = hasSmallCohort(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const hit = hasSmallCohort(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

function stringifyStructured(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

/**
 * Deny-by-default redaction gate. Blocks rather than sanitises on hard detectors.
 */
export function runRedactionGate(input: RedactionInput): RedactionResult {
  const classification = input.classification_max ?? 'internal';
  if (classification === 'confidential' || classification === 'restricted') {
    return {
      ok: false,
      code: 'NGOIS-AI-0003',
      reason: 'classification above Internal',
      detectors_fired: ['classification'],
    };
  }

  const permitted = input.permitted_views ?? PERMITTED_DEFAULT;
  const source = input.source_view ?? 'analytics_aggregates';
  if (!permitted.includes(source)) {
    return {
      ok: false,
      code: 'NGOIS-AI-0003',
      reason: `source view not permitted: ${source}`,
      detectors_fired: ['source_view'],
    };
  }

  const cohort = hasSmallCohort(input.structured);
  if (cohort) {
    return {
      ok: false,
      code: 'NGOIS-AI-0003',
      reason: `aggregate below k=5 at ${cohort}`,
      detectors_fired: ['small_cohort'],
    };
  }

  const structuredText = stringifyStructured(input.structured);
  const structScan = scanText(structuredText);
  // Structured context must be clean — any detector fire is a gate failure (deny-by-default).
  if (structScan.hardReject || structScan.fires.length > 0) {
    return {
      ok: false,
      code: 'NGOIS-AI-0003',
      reason: 'PII detected in structured context',
      detectors_fired: structScan.fires,
    };
  }

  let freeText: string | undefined;
  const fires = [...structScan.fires];
  if (input.free_text) {
    const ft = scanText(input.free_text);
    fires.push(...ft.fires);
    if (ft.hardReject) {
      return {
        ok: false,
        code: 'NGOIS-AI-0003',
        reason: 'hard PII in free text',
        detectors_fired: [...new Set(fires)],
      };
    }
    if (redactionRatio(input.free_text, ft.redacted) > 0.15) {
      return {
        ok: false,
        code: 'NGOIS-AI-0003',
        reason: 'free text more than 15% redacted — discarded',
        detectors_fired: [...new Set(fires)],
      };
    }
    freeText = ft.redacted;
  }

  // Second-pass verification
  const second = scanText(
    stringifyStructured(input.structured) + (freeText ? `\n${freeText}` : ''),
  );
  if (second.hardReject || second.fires.some((f) => ['national_id', 'bank_account', 'secret', 'tax_id'].includes(f))) {
    return {
      ok: false,
      code: 'NGOIS-AI-0003',
      reason: 'second-pass detector still fires',
      detectors_fired: [...new Set([...fires, ...second.fires])],
    };
  }

  return {
    ok: true,
    cleared: input.structured,
    free_text: freeText,
    detectors_fired: [...new Set(fires)],
  };
}

/** Extract numeric figures from structured context for numerical guardrail. */
export function extractFigures(structured: Record<string, unknown>): number[] {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) out.push(Number(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v as object).forEach(walk);
  };
  walk(structured);
  return out;
}

/** Every number in generated text must appear in input figures. */
export function numericalGuardrail(
  responseText: string,
  figures: number[],
): { ok: boolean; unmatched: string[] } {
  const allowed = new Set(figures.map((n) => String(n)));
  // also allow integers as ints
  for (const n of figures) {
    allowed.add(String(Math.round(n)));
    allowed.add(n.toFixed(1));
    allowed.add(n.toFixed(2));
  }
  const found = responseText.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g) ?? [];
  const unmatched = found.filter((f) => !allowed.has(f.replace(/,/g, '')));
  return { ok: unmatched.length === 0, unmatched };
}

/** Injection defence: field free text must never be concatenated into prompts. */
export function assertNoFieldTextInPrompt(prompt: string, fieldTexts: string[]): boolean {
  for (const t of fieldTexts) {
    if (t && t.length >= 8 && prompt.includes(t)) return false;
  }
  return true;
}
