<script setup lang="ts">
import { computed, ref, watch } from 'vue';

export type TabItem = {
  id: string;
  label: string;
};

const props = defineProps<{
  tabs: TabItem[];
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [string];
}>();

const tablistRef = ref<HTMLElement | null>(null);

const selectedIndex = computed(() => {
  const idx = props.tabs.findIndex((t) => t.id === props.modelValue);
  return idx >= 0 ? idx : 0;
});

function select(id: string) {
  emit('update:modelValue', id);
}

function focusTab(index: number) {
  const buttons = tablistRef.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  buttons?.[index]?.focus();
}

function onKeydown(e: KeyboardEvent) {
  if (!props.tabs.length) return;
  const len = props.tabs.length;
  let next = selectedIndex.value;

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    next = (selectedIndex.value + 1) % len;
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    next = (selectedIndex.value - 1 + len) % len;
  } else if (e.key === 'Home') {
    e.preventDefault();
    next = 0;
  } else if (e.key === 'End') {
    e.preventDefault();
    next = len - 1;
  } else {
    return;
  }

  const tab = props.tabs[next];
  if (!tab) return;
  select(tab.id);
  void focusTab(next);
}

watch(
  () => props.tabs,
  (tabs) => {
    if (!tabs.length) return;
    if (!tabs.some((t) => t.id === props.modelValue)) {
      emit('update:modelValue', tabs[0]!.id);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="tabs">
    <div
      ref="tablistRef"
      class="tablist"
      role="tablist"
      @keydown="onKeydown"
    >
      <button
        v-for="tab in tabs"
        :id="`tab-${tab.id}`"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="modelValue === tab.id"
        :tabindex="modelValue === tab.id ? 0 : -1"
        :aria-controls="`panel-${tab.id}`"
        class="tab"
        :class="{ active: modelValue === tab.id }"
        @click="select(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div
      v-for="tab in tabs"
      :id="`panel-${tab.id}`"
      :key="`panel-${tab.id}`"
      role="tabpanel"
      :aria-labelledby="`tab-${tab.id}`"
      class="panel"
      :hidden="modelValue !== tab.id"
    >
      <slot :name="tab.id" :tab="tab" />
    </div>
  </div>
</template>

<style scoped>
.tabs {
  display: grid;
  gap: var(--space-4);
}
.tablist {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-border);
}
.tab {
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
}
.tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
.tab:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.panel {
  min-width: 0;
}
</style>
