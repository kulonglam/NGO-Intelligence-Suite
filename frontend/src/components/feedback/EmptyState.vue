<script setup lang="ts">
defineProps<{
  title: string;
  body?: string;
}>();
</script>

<template>
  <div class="empty" role="status">
    <h3>{{ title }}</h3>
    <p v-if="body">{{ body }}</p>
    <div v-if="$slots.default" class="cta">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  text-align: center;
  padding: var(--space-6) var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface) 70%, transparent);
}
h3 {
  margin: 0 0 var(--space-2);
  font-size: 1.15rem;
  color: var(--brand-deep);
}
p {
  margin: 0 auto;
  max-width: 28rem;
  color: var(--color-text-muted);
}
.cta {
  margin-block-start: var(--space-4);
  display: flex;
  justify-content: center;
  gap: var(--space-3);
}
</style>
