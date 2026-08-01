<script setup lang="ts">
import Timeline from '../data/Timeline.vue';

export type AuditItem = {
  id: string;
  title: string;
  body?: string;
  at?: string;
};

defineProps<{
  items: AuditItem[];
  title?: string;
}>();
</script>

<template>
  <section class="audit">
    <h3 v-if="title">{{ title }}</h3>
    <Timeline :items="items" />
  </section>
</template>

<style scoped>
.audit h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-lg);
  color: var(--brand-deep);
}
</style>
