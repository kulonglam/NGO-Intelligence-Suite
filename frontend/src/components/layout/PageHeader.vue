<script setup lang="ts">
defineProps<{
  eyebrow?: string;
  title: string;
  lede?: string;
  headingId?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div class="copy">
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <h1 :id="headingId">{{ title }}</h1>
      <p v-if="lede" class="lede">{{ lede }}</p>
    </div>
    <div v-if="$slots.actions" class="actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: var(--space-5);
  margin-block-end: var(--space-5);
  flex-wrap: wrap;
}
.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
  color: var(--color-primary);
  font-weight: 600;
}
h1 {
  margin: 0.4rem 0 0;
  color: var(--brand-deep);
  font-size: clamp(1.75rem, 2.5vw, 2.25rem);
}
.lede {
  margin: 0.65rem 0 0;
  max-width: 42rem;
  color: var(--color-text-muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}
</style>
