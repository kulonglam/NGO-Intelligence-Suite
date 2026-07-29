/** Decimal string helpers — money stays as strings end-to-end. */

export function parseMoney(v: string): bigint {
  const m = v.match(/^(-?\d+)(?:\.(\d{1,2}))?$/);
  if (!m) throw new Error(`Invalid money: ${v}`);
  const whole = BigInt(m[1]!);
  const frac = (m[2] ?? '').padEnd(2, '0').slice(0, 2);
  const sign = whole < 0n ? -1n : 1n;
  return sign * (abs(whole) * 100n + BigInt(frac || '0'));
}

function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}

export function formatMoney(cents: bigint): string {
  const neg = cents < 0n;
  const v = abs(cents);
  const whole = v / 100n;
  const frac = (v % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

/** Half-up round to 2dp from raw rational (numerator in cents scale * 10000 for extra precision). */
export function roundHalfUp(fromCentsTimes100: bigint): bigint {
  const neg = fromCentsTimes100 < 0n;
  const v = abs(fromCentsTimes100);
  const rounded = (v + 50n) / 100n;
  return neg ? -rounded : rounded;
}

export function mulRate(amountCents: bigint, ratePercent: string): bigint {
  const [whole, frac = '0'] = ratePercent.split('.');
  const rateBp = BigInt(whole!) * 100n + BigInt(frac.padEnd(2, '0').slice(0, 2));
  return roundHalfUp((amountCents * rateBp) / 100n);
}

export function add(a: string, b: string): string {
  return formatMoney(parseMoney(a) + parseMoney(b));
}

export function sub(a: string, b: string): string {
  return formatMoney(parseMoney(a) - parseMoney(b));
}

export function isNegative(v: string): boolean {
  return parseMoney(v) < 0n;
}

export function isZero(v: string): boolean {
  return parseMoney(v) === 0n;
}

export function compare(a: string, b: string): number {
  const da = parseMoney(a);
  const db = parseMoney(b);
  if (da < db) return -1;
  if (da > db) return 1;
  return 0;
}
