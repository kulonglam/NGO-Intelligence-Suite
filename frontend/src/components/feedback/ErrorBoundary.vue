<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '../base/BaseButton.vue';

const { t } = useI18n();
const error = ref<Error | null>(null);

onErrorCaptured((err) => {
  error.value = err instanceof Error ? err : new Error(String(err));
  return false;
});

function retry() {
  error.value = null;
}
</script>

<template>
  <div v-if="error" class="fallback" role="alert">
    <h3>{{ t('app.error') }}</h3>
    <p>{{ error.message }}</p>
    <div class="actions">
      <slot name="retry" :retry="retry" :error="error">
        <BaseButton variant="secondary" @click="retry">{{ t('app.retry') }}</BaseButton>
      </slot>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
.fallback {
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--color-danger) 40%, var(--color-border));
  border-radius: var(--radius-lg);
  background: var(--color-danger-subtle);
}
h3 {
  margin: 0 0 var(--space-2);
  font-size: 1.1rem;
  color: var(--color-danger);
}
p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.92rem;
}
.actions {
  margin-block-start: var(--space-4);
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}
</style>
