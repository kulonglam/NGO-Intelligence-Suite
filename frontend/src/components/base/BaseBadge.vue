<script setup lang="ts">
defineProps<{
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}>();
</script>

<template>
  <span class="badge" :data-tone="tone ?? 'default'">
    <slot />
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  border-radius: var(--radius-pill);
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.3;
  background: var(--color-surface-sunken);
  color: var(--color-text);
}
.badge[data-tone='success'] {
  background: var(--color-success-subtle);
  color: var(--color-success);
}
.badge[data-tone='warning'] {
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}
.badge[data-tone='danger'] {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}
.badge[data-tone='info'] {
  background: var(--color-info-subtle);
  color: var(--color-info);
}
</style>
