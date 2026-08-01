<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <p class="label" data-ai="unapproved" role="status">
    {{ t('ai.machineLabel') }}
  </p>
</template>

<style scoped>
.label {
  margin: 0;
  padding: 0.45rem 0.75rem;
  border-radius: var(--radius-md);
  background: var(--color-warning-subtle);
  color: var(--color-warning);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.02em;
}
</style>
