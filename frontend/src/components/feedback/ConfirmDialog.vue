<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import BaseButton from '../base/BaseButton.vue';

const props = defineProps<{
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const panel = ref<HTMLElement | null>(null);
const previouslyFocused = ref<HTMLElement | null>(null);

function onKey(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('cancel');
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
      panel.value?.querySelector<HTMLElement>('button')?.focus();
    } else if (previouslyFocused.value) {
      previouslyFocused.value.focus();
    }
  },
);

onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="open" class="backdrop" @click.self="emit('cancel')">
    <div
      ref="panel"
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="'confirm-title'"
      :aria-describedby="body ? 'confirm-body' : undefined"
    >
      <h2 id="confirm-title">{{ title }}</h2>
      <p v-if="body" id="confirm-body">{{ body }}</p>
      <div class="actions">
        <BaseButton variant="ghost" @click="emit('cancel')">
          {{ cancelLabel ?? 'Cancel' }}
        </BaseButton>
        <BaseButton :variant="danger ? 'danger' : 'primary'" @click="emit('confirm')">
          {{ confirmLabel ?? 'Confirm' }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(20, 38, 43, 0.45);
  display: grid;
  place-items: center;
  padding: var(--space-4);
}
.dialog {
  width: min(28rem, 100%);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  padding: var(--space-5);
  box-shadow: var(--shadow-md);
}
h2 {
  margin: 0 0 var(--space-3);
  font-size: 1.25rem;
  color: var(--brand-deep);
}
p {
  margin: 0 0 var(--space-5);
  color: var(--color-text-muted);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
}
</style>
