<script setup lang="ts">
defineProps<{
  size?: 'sm' | 'md';
}>();
</script>

<template>
  <span class="spinner" :class="size ?? 'md'" role="status" aria-label="loading">
    <span class="ring" aria-hidden="true" />
  </span>
</template>

<style scoped>
.spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
}
.sm {
  width: 1rem;
  height: 1rem;
}
.md {
  width: 1.5rem;
  height: 1.5rem;
}
.ring {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border: 2px solid var(--color-border);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ring {
    animation: none;
    border-top-color: var(--color-border);
    opacity: 0.7;
  }
}
</style>
