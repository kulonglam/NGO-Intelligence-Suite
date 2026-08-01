<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [string] }>();
const { t } = useI18n();
</script>

<template>
  <div class="toolbar">
    <label class="search">
      <span class="sr-only">{{ t('table.filter') }}</span>
      <input
        type="search"
        :value="modelValue"
        :placeholder="placeholder ?? t('table.filterPlaceholder')"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <div v-if="$slots.filters" class="filters">
      <slot name="filters" />
    </div>
    <div v-if="$slots.actions" class="actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-block-end: 0.85rem;
}
.search {
  flex: 1 1 14rem;
  min-width: 12rem;
}
search input,
.search input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.55rem 0.75rem;
  background: var(--color-surface);
  color: var(--color-text);
}
.search input:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
.filters,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.actions {
  margin-inline-start: auto;
}
</style>
