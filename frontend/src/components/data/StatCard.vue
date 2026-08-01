<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import SkeletonBlock from '../feedback/SkeletonBlock.vue';

defineProps<{
  label: string;
  value?: string | null;
  hint?: string;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
}>();

const { t } = useI18n();
</script>

<template>
  <article class="stat" :aria-busy="loading ? 'true' : undefined">
    <p class="label">{{ label }}</p>
    <SkeletonBlock v-if="loading" :rows="1" height="1.75rem" />
    <p v-else-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="empty || value == null || value === ''" class="value empty">
      {{ t('app.emptyTitle') }}
    </p>
    <p v-else class="value bidi-isolate" dir="ltr">{{ value }}</p>
    <p v-if="hint && !loading && !error" class="hint">{{ hint }}</p>
  </article>
</template>

<style scoped>
.stat {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
  display: grid;
  gap: 0.35rem;
}
.label {
  margin: 0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  font-weight: 600;
}
.value {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.65rem;
  color: var(--brand-deep);
  line-height: 1.2;
}
.value.empty {
  font-size: 1rem;
  color: var(--color-text-muted);
  font-family: var(--font-sans);
}
.error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.92rem;
}
.hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
</style>
