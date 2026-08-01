<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useThemeStore, type ThemePreference } from '../../stores/theme';

withDefaults(
  defineProps<{
    variant?: 'onBrand' | 'surface';
  }>(),
  { variant: 'surface' },
);

const { t } = useI18n();
const theme = useThemeStore();

function onChange(ev: Event) {
  theme.setPreference((ev.target as HTMLSelectElement).value as ThemePreference);
}
</script>

<template>
  <label class="theme" :class="variant">
    <span class="sr-only">{{ t('theme.label') }}</span>
    <select :value="theme.preference" :aria-label="t('theme.label')" @change="onChange">
      <option value="system">{{ t('theme.system') }}</option>
      <option value="light">{{ t('theme.light') }}</option>
      <option value="dark">{{ t('theme.dark') }}</option>
    </select>
  </label>
</template>

<style scoped>
.theme select {
  border-radius: var(--radius-pill);
  padding: 0.4rem 0.7rem;
  font: inherit;
  font-size: var(--text-sm);
}
.theme.surface select {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}
.theme.onBrand select {
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.theme select:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
</style>
