<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import BaseButton from '../base/BaseButton.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    side?: 'start' | 'end';
  }>(),
  { side: 'end' },
);

const emit = defineEmits<{
  close: [];
  'update:open': [boolean];
}>();

const panel = ref<HTMLElement | null>(null);
const previouslyFocused = ref<HTMLElement | null>(null);

function close() {
  emit('close');
  emit('update:open', false);
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
  if (e.key === 'Tab' && panel.value) {
    const focusable = [
      ...panel.value.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => !el.hasAttribute('disabled'));
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocused.value = document.activeElement as HTMLElement | null;
      await nextTick();
      panel.value?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    } else if (previouslyFocused.value) {
      previouslyFocused.value.focus();
    }
  },
);

onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="open" class="backdrop" @click.self="close">
    <aside
      ref="panel"
      class="drawer"
      :class="side"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'drawer-title'"
    >
      <header class="head">
        <h2 id="drawer-title">{{ title }}</h2>
        <BaseButton variant="ghost" :aria-label="'Close'" @click="close">×</BaseButton>
      </header>
      <div class="body">
        <slot />
      </div>
    </aside>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: var(--color-overlay);
}
.drawer {
  position: absolute;
  inset-block: 0;
  width: min(22rem, 92vw);
  background: var(--color-surface);
  border: 0 solid var(--color-border);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  padding: var(--space-4);
}
.drawer.start {
  inset-inline-start: 0;
  border-inline-end-width: 1px;
}
.drawer.end {
  inset-inline-end: 0;
  border-inline-start-width: 1px;
}
.head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
h2 {
  margin: 0;
  font-size: 1.15rem;
  color: var(--brand-deep);
}
.body {
  flex: 1;
  overflow: auto;
  color: var(--color-text);
}
</style>
