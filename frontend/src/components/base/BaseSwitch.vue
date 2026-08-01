<script setup lang="ts">
import { computed, useId } from 'vue';

const props = defineProps<{
  label: string;
  modelValue: boolean;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const id = useId();
const describedBy = computed(() => {
  const ids: string[] = [];
  if (props.hint) ids.push(`${id}-hint`);
  if (props.error) ids.push(`${id}-error`);
  return ids.join(' ') || undefined;
});

function toggle() {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
}
</script>

<template>
  <div class="field">
    <div class="row">
      <button
        :id="id"
        type="button"
        role="switch"
        class="switch"
        :class="{ on: modelValue }"
        :aria-checked="modelValue"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        :aria-label="label"
        :disabled="disabled"
        @click="toggle"
      >
        <span class="thumb" aria-hidden="true" />
      </button>
      <label class="label" :for="id" @click.prevent="toggle">{{ label }}</label>
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
.row {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
}
.label {
  font-size: 0.92rem;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
}
.switch {
  position: relative;
  width: 2.5rem;
  height: 1.4rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface-sunken);
  padding: 0;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}
.switch.on {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.switch:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.switch:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.thumb {
  position: absolute;
  top: 0.12rem;
  inset-inline-start: 0.15rem;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: var(--color-surface);
  transition: inset-inline-start var(--duration-fast) var(--ease-standard);
  box-shadow: var(--shadow-sm);
}
.switch.on .thumb {
  inset-inline-start: calc(100% - 1.15rem);
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
