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

function onHijriChange(ev: Event) {
  localeStore.setShowHijri((ev.target as HTMLInputElement).checked);
}
</script>

<template>
  <div class="locale-block" :class="variant">
    <label class="locale">
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
    <label v-if="localeStore.locale === 'ar'" class="hijri">
      <input
        type="checkbox"
        :checked="localeStore.showHijri"
        @change="onHijriChange"
      />
      <span>{{ t('app.hijri') }}</span>
    </label>
  </div>
</template>

<style scoped>
.locale-block {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  max-width: 100%;
  min-width: 0;
}
.locale select {
  border-radius: var(--radius-pill);
  padding: 0.4rem 0.7rem;
  font: inherit;
}
.locale-block.surface select {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}
.locale-block.onBrand select {
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.hijri {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  cursor: pointer;
  min-width: 0;
  max-width: 100%;
}
.hijri span {
  overflow-wrap: anywhere;
}
.locale-block.surface .hijri {
  color: var(--color-text-muted);
}
.locale-block.onBrand .hijri {
  color: rgba(255, 255, 255, 0.85);
}
.locale select:focus-visible,
.hijri input:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
</style>
