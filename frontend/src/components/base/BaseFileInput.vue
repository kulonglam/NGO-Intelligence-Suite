<script setup lang="ts">
import { computed, ref, useId } from 'vue';

const props = defineProps<{
  label: string;
  modelValue?: string;
  accept?: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  multiple?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [string];
  files: [FileList | null];
}>();

const id = useId();
const inputRef = ref<HTMLInputElement | null>(null);
const selectedName = computed(() => props.modelValue || '');

const describedBy = computed(() => {
  const ids: string[] = [];
  if (props.hint) ids.push(`${id}-hint`);
  if (props.error) ids.push(`${id}-error`);
  return ids.join(' ') || undefined;
});

function onChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const list = input.files;
  emit('files', list);
  if (!list || list.length === 0) {
    emit('update:modelValue', '');
    return;
  }
  const names = Array.from(list)
    .map((f) => f.name)
    .join(', ');
  emit('update:modelValue', names);
}
</script>

<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <input
      :id="id"
      ref="inputRef"
      type="file"
      class="input"
      :accept="accept"
      :required="required"
      :disabled="disabled"
      :multiple="multiple"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @change="onChange"
    />
    <p v-if="selectedName" class="filename" aria-live="polite">{{ selectedName }}</p>
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
  padding: 0.55rem 0.75rem;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}
.input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.input:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.filename {
  margin: 0;
  color: var(--color-text);
  font-size: 0.88rem;
  word-break: break-all;
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
