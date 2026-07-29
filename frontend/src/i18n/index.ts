import { createI18n } from 'vue-i18n';
import en from '../locales/en.json';

export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export function isRtlLocale(locale: string): boolean {
  return locale === 'ar';
}

type MessageSchema = typeof en;

export const i18n = createI18n({
  legacy: false,
  locale: 'en' as AppLocale,
  fallbackLocale: 'en' as AppLocale,
  messages: { en } as Record<AppLocale, MessageSchema>,
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
});

export async function loadLocale(locale: AppLocale): Promise<void> {
  if (locale !== 'en' && !i18n.global.availableLocales.includes(locale)) {
    const messages = (await import(`../locales/${locale}.json`)) as {
      default?: MessageSchema;
    } & MessageSchema;
    i18n.global.setLocaleMessage(locale, messages.default ?? messages);
  }
  i18n.global.locale.value = locale;
}
