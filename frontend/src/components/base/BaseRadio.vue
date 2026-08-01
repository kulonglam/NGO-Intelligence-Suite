<script setup lang="ts">
import { computed, useId } from 'vue';

const props = defineProps<{
  label: string;
  modelValue: string;
  value: string;
  name: string;
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
    <label class="control" :class="{ disabled }">
      <input
        :id="id"
        type="radio"
        :name="name"
        :value="value"
        :checked="modelValue === value"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        class="input"
        @change="emit('update:modelValue', value)"
      />
      <span class="label">{{ label }}</span>
    </label>
    <p v-if="hint" :id="`${id}-hint`" class="hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: 0.4rem;
}
.control {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.92rem;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
}
.control.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--color-primary);
}
.input:focus-visible {
  outline: 3px solid var(--color-focus);
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
