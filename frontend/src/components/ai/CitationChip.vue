<script setup lang="ts">
defineProps<{
  id: string;
  label?: string;
}>();
</script>

<template>
  <span class="chip" dir="ltr" :title="id">{{ label ?? id.slice(0, 8) }}</span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
}
</style>
