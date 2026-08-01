<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { AppLocale } from '../../i18n';
import { useLocaleStore } from '../../stores/locale';

withDefaults(
  defineProps<{
    variant?: 'onBrand' | 'surface';
  }>(),
  { variant: 'surface' },
);

const { t } = useI18n();
const localeStore = useLocaleStore();

async function onChange(ev: Event) {
  const value = (ev.target as HTMLSelectElement).value as AppLocale;
  await localeStore.setLocale(value);
}
</script>

<template>
  <label class="locale" :class="variant">
    <span class="sr-only">{{ t('app.language') }}</span>
    <select
      :value="localeStore.locale"
      :aria-label="t('app.language')"
      @change="onChange"
    >
      <option value="en">English</option>
      <option value="ar">العربية</option>
    </select>
  </label>
</template>

<style scoped>
.locale select {
  border-radius: var(--radius-pill);
  padding: 0.4rem 0.7rem;
  font: inherit;
}
.locale.surface select {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}
.locale.onBrand select {
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.locale select:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
</style>
