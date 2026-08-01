<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import BaseButton from '../base/BaseButton.vue';

withDefaults(
  defineProps<{
    title?: string;
    body?: string;
    retryLabel?: string;
    showRetry?: boolean;
  }>(),
  { showRetry: true },
);

const emit = defineEmits<{
  retry: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="error-state" role="alert">
    <h3>{{ title ?? t('app.error') }}</h3>
    <p v-if="body">{{ body }}</p>
    <div v-if="showRetry || $slots.default" class="actions">
      <slot>
        <BaseButton v-if="showRetry" variant="secondary" @click="emit('retry')">
          {{ retryLabel ?? t('app.retry') }}
        </BaseButton>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.error-state {
  text-align: center;
  padding: var(--space-6) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
  border-radius: var(--radius-lg);
  background: var(--color-danger-subtle, color-mix(in srgb, var(--color-danger) 8%, var(--color-surface)));
}
h3 {
  margin: 0 0 var(--space-2);
  font-size: 1.1rem;
  color: var(--color-danger);
}
p {
  margin: 0 auto;
  max-width: 28rem;
  color: var(--color-text-muted);
}
.actions {
  margin-block-start: var(--space-4);
  display: flex;
  justify-content: center;
  gap: var(--space-3);
}
</style>
