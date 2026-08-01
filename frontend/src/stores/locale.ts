import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  type AppLocale,
  isRtlLocale,
  loadLocale,
  SUPPORTED_LOCALES,
} from '../i18n';

const STORAGE_KEY = 'ngois_locale';
const HIJRI_KEY = 'ngois_show_hijri';

function initialLocale(): AppLocale {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)) {
    return saved as AppLocale;
  }
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith('ar')) return 'ar';
  return 'en';
}

function initialShowHijri(): boolean {
  const saved = localStorage.getItem(HIJRI_KEY);
  if (saved === '0') return false;
  if (saved === '1') return true;
  return initialLocale() === 'ar';
}

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<AppLocale>(initialLocale());
  const showHijri = ref(initialShowHijri());
  const direction = computed(() => (isRtlLocale(locale.value) ? 'rtl' : 'ltr'));

  async function setLocale(next: AppLocale) {
    await loadLocale(next);
    locale.value = next;
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
    document.documentElement.dir = isRtlLocale(next) ? 'rtl' : 'ltr';
    if (next === 'ar' && localStorage.getItem(HIJRI_KEY) == null) {
      showHijri.value = true;
    }
  }

  function setShowHijri(next: boolean) {
    showHijri.value = next;
    localStorage.setItem(HIJRI_KEY, next ? '1' : '0');
  }

  async function init() {
    await setLocale(locale.value);
  }

  watch(
    locale,
    (v) => {
      document.documentElement.lang = v;
      document.documentElement.dir = isRtlLocale(v) ? 'rtl' : 'ltr';
    },
    { immediate: true },
  );

  return {
    locale,
    direction,
    showHijri,
    setLocale,
    setShowHijri,
    init,
    supported: SUPPORTED_LOCALES,
  };
});
