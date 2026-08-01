<script setup lang="ts">
import { computed, useId } from 'vue';

const props = defineProps<{
  label: string;
  modelValue: string;
  rows?: number;
  required?: boolean;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [string] }>();
const id = useId();
const describedBy = computed(() => {
  const ids: string[] = [];
  if (props.hint) ids.push(`${id}-hint`);
  if (props.error) ids.push(`${id}-error`);
  return ids.join(' ') || undefined;
});
</script>

<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <textarea
      :id="id"
      :value="modelValue"
      :rows="rows ?? 4"
      :required="required"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      class="input"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <p v-if="hint" :id="`${id}-hint`" class="hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="error" role="alert">{{ error }}</p>
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
.input {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.7rem 0.85rem;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  resize: vertical;
}
.input:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
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
