<script setup lang="ts">
defineProps<{
  title: string;
  titleId?: string;
  lede?: string;
}>();
</script>

<template>
  <section class="section" :aria-labelledby="titleId">
    <header class="head">
      <h2 :id="titleId" class="title">{{ title }}</h2>
      <p v-if="lede" class="lede">{{ lede }}</p>
    </header>
    <div class="body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.section {
  display: grid;
  gap: var(--space-4);
}
.head {
  display: grid;
  gap: var(--space-2);
}
.title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 650;
  color: var(--brand-deep);
}
.lede {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: 1.5;
  max-width: 40rem;
}
.body {
  display: grid;
  gap: var(--space-4);
}
</style>
