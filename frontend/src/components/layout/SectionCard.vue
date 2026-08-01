<script setup lang="ts">
defineProps<{
  title?: string;
  titleId?: string;
}>();
</script>

<template>
  <section class="card" :aria-labelledby="title && titleId ? titleId : undefined">
    <div v-if="title || $slots.actions" class="head">
      <h2 v-if="title" :id="titleId">{{ title }}</h2>
      <div v-if="$slots.actions" class="actions">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.card {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
  display: grid;
  gap: var(--space-4);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
h2 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--brand-deep);
}
.actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
