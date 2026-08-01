<script setup lang="ts">
import { useToastStore } from '../../stores/toast';

const toast = useToastStore();
</script>

<template>
  <div class="host" aria-live="polite" aria-relevant="additions">
    <div
      v-for="item in toast.items"
      :key="item.id"
      class="toast"
      :class="item.kind"
      role="status"
    >
      <span>{{ item.message }}</span>
      <button type="button" class="dismiss" :aria-label="'Dismiss'" @click="toast.dismiss(item.id)">
        ×
      </button>
    </div>
  </div>
</template>

<style scoped>
.host {
  position: fixed;
  inset-block-end: 1.25rem;
  inset-inline-end: 1.25rem;
  z-index: 80;
  display: grid;
  gap: 0.65rem;
  max-width: min(22rem, calc(100vw - 2rem));
}
.toast {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  color: var(--color-text);
}
.toast.success {
  border-color: color-mix(in srgb, var(--color-success) 45%, var(--color-border));
}
.toast.error {
  border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border));
  color: var(--color-danger);
}
.dismiss {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
  color: inherit;
  opacity: 0.7;
}
.dismiss:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
</style>
