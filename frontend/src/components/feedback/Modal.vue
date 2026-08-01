<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import BaseButton from '../base/BaseButton.vue';

const props = defineProps<{
  open: boolean;
  title: string;
}>();

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
    <div
      ref="panel"
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'modal-title'"
    >
      <header class="head">
        <h2 id="modal-title">{{ title }}</h2>
        <BaseButton variant="ghost" :aria-label="'Close'" @click="close">×</BaseButton>
      </header>
      <div class="body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="footer">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: var(--color-overlay);
  display: grid;
  place-items: center;
  padding: var(--space-4);
}
.dialog {
  width: min(32rem, 100%);
  max-height: min(90vh, 40rem);
  overflow: auto;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  padding: var(--space-5);
  box-shadow: var(--shadow-md);
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
  font-size: 1.25rem;
  color: var(--brand-deep);
}
.body {
  color: var(--color-text);
}
.footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-top: var(--space-5);
}
</style>
