import { createHmac, createHash } from 'node:crypto';

/** Appendix I.7 — beneficiary deduplication (flag, never auto-merge). */

export type DedupIndexes = {
  name_index: string;
  name_phonetic_index: string;
  phone_index: string | null;
  national_id_index: string | null;
};

export type DedupCandidate = DedupIndexes & {
  id: string;
  birth_year?: number | null;
  sex?: string | null;
  admin_area?: string | null;
  household_id?: string | null;
  registered_at?: Date | string | null;
};

export type DedupSubject = DedupCandidate & {
  registered_at?: Date | string | null;
};

export type DedupSignal = { signal: string; points: number };

export type DedupResult = {
  score: number;
  priority: 'probable' | 'possible' | 'none';
  signals: DedupSignal[];
  /** Never true — platform never auto-merges (ADR-0005 / I.7). */
  auto_merge: false;
};

function stripDiacritics(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '');
}

export function normaliseName(fullName: string): string {
  return stripDiacritics(fullName)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** Lightweight phonetic token (Double-Metaphone stand-in for local fixtures). */
export function phoneticToken(token: string): string {
  const t = stripDiacritics(token).toLowerCase().replace(/[^a-z]/g, '');
  if (!t) return '';
  let out = t[0]!;
  const map: Record<string, string> = {
    b: '1',
    f: '1',
    p: '1',
    v: '1',
    c: '2',
    g: '2',
    j: '2',
    k: '2',
    q: '2',
    s: '2',
    x: '2',
    z: '2',
    d: '3',
    t: '3',
    l: '4',
    m: '5',
    n: '5',
    r: '6',
  };
  let last = map[out] ?? out;
  for (const ch of t.slice(1)) {
    const code = map[ch] ?? (ch === 'a' || ch === 'e' || ch === 'i' || ch === 'o' || ch === 'u' || ch === 'y' || ch === 'h' || ch === 'w' ? '' : ch);
    if (!code || code === last) continue;
    out += code;
    last = code;
    if (out.length >= 4) break;
  }
  return (out + '0000').slice(0, 4).toUpperCase();
}

export function phoneticKey(fullName: string): string {
  return normaliseName(fullName)
    .split(' ')
    .map(phoneticToken)
    .filter(Boolean)
    .sort()
    .join('|');
}

export function hmacIndex(secret: Buffer | string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function buildIndexes(
  secret: Buffer | string,
  input: {
    full_name: string;
    phone_e164?: string | null;
    national_id?: string | null;
  },
): DedupIndexes {
  const nameNorm = normaliseName(input.full_name);
  const phone = input.phone_e164?.replace(/\s+/g, '') ?? null;
  const nid = input.national_id?.replace(/\s+/g, '').toLowerCase() ?? null;
  return {
    name_index: hmacIndex(secret, nameNorm),
    name_phonetic_index: hmacIndex(secret, phoneticKey(input.full_name)),
    phone_index: phone ? hmacIndex(secret, phone) : null,
    national_id_index: nid ? hmacIndex(secret, nid) : null,
  };
}

function daysApart(a?: Date | string | null, b?: Date | string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.abs(da - db) / 86_400_000;
}

export function scoreDuplicate(subject: DedupSubject, candidate: DedupCandidate): DedupResult {
  const signals: DedupSignal[] = [];
  let score = 0;

  const add = (signal: string, points: number) => {
    signals.push({ signal, points });
    score += points;
  };

  if (
    subject.national_id_index &&
    candidate.national_id_index &&
    subject.national_id_index === candidate.national_id_index
  ) {
    add('national_id_index', 60);
  }
  if (subject.name_index === candidate.name_index) {
    add('name_index', 40);
  } else if (subject.name_phonetic_index === candidate.name_phonetic_index) {
    add('name_phonetic_index', 25);
  }
  if (subject.phone_index && candidate.phone_index && subject.phone_index === candidate.phone_index) {
    add('phone_index', 30);
  }
  if (subject.birth_year != null && candidate.birth_year != null) {
    if (subject.birth_year === candidate.birth_year) add('birth_year_exact', 12);
    else if (Math.abs(subject.birth_year - candidate.birth_year) === 1) add('birth_year_near', 6);
  }
  if (subject.sex && candidate.sex && subject.sex === candidate.sex) add('sex', 5);
  if (subject.admin_area && candidate.admin_area && subject.admin_area === candidate.admin_area) {
    add('admin_area', 8);
  }
  if (
    subject.household_id &&
    candidate.household_id &&
    subject.household_id === candidate.household_id
  ) {
    add('household', 15);
  }
  const days = daysApart(subject.registered_at, candidate.registered_at);
  if (days != null && days <= 30) add('registered_within_30d', 5);

  score = Math.min(100, score);
  const priority: DedupResult['priority'] =
    score >= 70 ? 'probable' : score >= 45 ? 'possible' : 'none';

  return { score, priority, signals, auto_merge: false };
}

export function corpusHash(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}
