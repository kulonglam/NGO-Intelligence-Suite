<script setup lang="ts">
import { ref, watch } from 'vue';

export type AccordionItem = {
  id: string;
  title: string;
  body?: string;
};

const props = withDefaults(
  defineProps<{
    items: AccordionItem[];
    allowMultiple?: boolean;
    modelValue?: string[];
  }>(),
  {
    allowMultiple: false,
    modelValue: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [string[]];
}>();

const openIds = ref<Set<string>>(new Set(props.modelValue ?? []));

watch(
  () => props.modelValue,
  (next) => {
    if (next) openIds.value = new Set(next);
  },
);

function isOpen(id: string) {
  return openIds.value.has(id);
}

function toggle(id: string) {
  const next = new Set(openIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    if (!props.allowMultiple) next.clear();
    next.add(id);
  }
  openIds.value = next;
  emit('update:modelValue', [...next]);
}
</script>

<template>
  <div class="accordion">
    <div v-for="item in items" :key="item.id" class="item">
      <h3 class="heading">
        <button
          type="button"
          class="trigger"
          :aria-expanded="isOpen(item.id)"
          :aria-controls="`accordion-panel-${item.id}`"
          :id="`accordion-trigger-${item.id}`"
          @click="toggle(item.id)"
        >
          <span>{{ item.title }}</span>
          <span class="chev" aria-hidden="true">{{ isOpen(item.id) ? '▾' : '▸' }}</span>
        </button>
      </h3>
      <div
        v-show="isOpen(item.id)"
        :id="`accordion-panel-${item.id}`"
        role="region"
        :aria-labelledby="`accordion-trigger-${item.id}`"
        class="panel"
      >
        <slot :name="item.id" :item="item">
          <p v-if="item.body" class="body">{{ item.body }}</p>
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.accordion {
  display: grid;
  gap: var(--space-2);
}
.item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}
.heading {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}
.trigger {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: var(--space-3);
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  text-align: start;
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
}
.trigger:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: -3px;
}
.panel {
  padding: 0 var(--space-4) var(--space-4);
}
.body {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: 1.5;
}
.chev {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
</style>
