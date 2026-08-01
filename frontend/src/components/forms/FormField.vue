<script setup lang="ts">
import { useId } from 'vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
}>();

const id = useId();
const { t } = useI18n();
</script>

<template>
  <div class="field">
    <label :for="id">
      {{ label }}
      <span v-if="required" class="req" aria-hidden="true">*</span>
      <span v-if="required" class="sr-only">{{ t('forms.required') }}</span>
    </label>
    <div class="control">
      <slot :id="id" />
    </div>
    <p v-if="hint" class="hint">{{ hint }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: 0.4rem;
}
label {
  font-size: 0.92rem;
  font-weight: 500;
}
.req {
  color: var(--color-danger);
  margin-inline-start: 0.15rem;
}
.hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.88rem;
}
</style>
