/** Format money with explicit ISO-4217 code (SDD §19.6). */
export function formatMoney(amount: string | number, currency: string, locale = 'en'): string {
  const code = currency.toUpperCase();
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isFinite(n)) {
    try {
      return `${code} ${new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n)}`;
    } catch {
      /* fall through */
    }
  }
  return `${code} ${amount}`;
}

function toDate(value: string | number | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Locale-aware Gregorian date (SDD §19.6). */
export function formatGregorian(
  value: string | number | Date,
  locale = 'en',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const d = toDate(value);
  if (!d) return String(value);
  try {
    return new Intl.DateTimeFormat(locale, { ...options, calendar: 'gregory' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Hijri (Umm al-Qura) companion date for Arabic locales (SDD §19.6). */
export function formatHijri(
  value: string | number | Date,
  locale = 'ar',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const d = toDate(value);
  if (!d) return String(value);
  const tag = locale.startsWith('ar') ? 'ar-SA' : 'en';
  try {
    return new Intl.DateTimeFormat(`${tag}-u-ca-islamic-umalqura`, options).format(d);
  } catch {
    try {
      return new Intl.DateTimeFormat(`${tag}-u-ca-islamic`, options).format(d);
    } catch {
      return formatGregorian(d, locale, options);
    }
  }
}

export function statusLabel(
  t: (key: string) => string,
  status: string,
): string {
  const key = `status.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}
