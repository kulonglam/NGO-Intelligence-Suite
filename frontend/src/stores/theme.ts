import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'ngois_theme';

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readPreference(): ThemePreference {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(readPreference());
  const system = ref<ResolvedTheme>(typeof window !== 'undefined' ? systemTheme() : 'light');

  const resolvedTheme = computed<ResolvedTheme>(() =>
    preference.value === 'system' ? system.value : preference.value,
  );

  function apply() {
    document.documentElement.setAttribute('data-theme', resolvedTheme.value);
  }

  function setPreference(next: ThemePreference) {
    preference.value = next;
    localStorage.setItem(STORAGE_KEY, next);
    apply();
  }

  function init() {
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      system.value = mq.matches ? 'dark' : 'light';
      if (preference.value === 'system') apply();
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }

  watch(resolvedTheme, apply);

  return {
    preference,
    resolvedTheme,
    setPreference,
    init,
    apply,
  };
});
