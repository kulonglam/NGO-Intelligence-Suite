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

export function statusLabel(
  t: (key: string) => string,
  status: string,
): string {
  const key = `status.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}
