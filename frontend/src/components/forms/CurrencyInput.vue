<script setup lang="ts">
import { computed, useId } from 'vue';

const props = defineProps<{
  modelValue: string;
  currency: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [string];
  'update:currency': [string];
}>();

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
    <div class="row" dir="ltr">
      <input
        :id="id"
        :value="modelValue"
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
      <input
        :id="`${id}-currency`"
        :value="currency"
        type="text"
        maxlength="3"
        autocomplete="off"
        :required="required"
        :aria-label="currency"
        class="currency"
        @input="emit('update:currency', ($event.target as HTMLInputElement).value.toUpperCase())"
      />
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
  gap: 0;
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
.currency {
  width: 4.25rem;
  border: 0;
  border-inline-start: 1px solid var(--color-border);
  padding: 0 var(--space-2);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  text-align: center;
  text-transform: uppercase;
}
.currency:focus {
  outline: none;
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
