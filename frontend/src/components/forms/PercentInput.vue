<script setup lang="ts">
import { computed, useId } from 'vue';

const props = defineProps<{
  modelValue: string | number;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [string];
}>();

const id = useId();
const displayValue = computed(() =>
  props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue),
);
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
    <div class="row" dir="ltr">
      <input
        :id="id"
        :value="displayValue"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        :required="required"
        :placeholder="placeholder"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        class="input"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <span class="suffix" aria-hidden="true">%</span>
    </div>
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
.row {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}
.input {
  flex: 1;
  min-width: 0;
  border: 0;
  padding: 0.7rem 0.85rem;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  direction: ltr;
  text-align: start;
  unicode-bidi: isolate;
}
.suffix {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-3);
  border-inline-start: 1px solid var(--color-border);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-weight: 600;
}
.row:focus-within {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.input:focus {
  outline: none;
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
