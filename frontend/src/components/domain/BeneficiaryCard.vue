<script setup lang="ts">
import BaseAvatar from '../base/BaseAvatar.vue';
import VulnerabilityBadge from './VulnerabilityBadge.vue';

defineProps<{
  name: string;
  householdSize?: number | string;
  settlement?: string;
  vulnerability?: string;
}>();
</script>

<template>
  <article class="card">
    <BaseAvatar :name="name" size="lg" />
    <div class="body">
      <h3>{{ name }}</h3>
      <p v-if="settlement" class="meta">{{ settlement }}</p>
      <p v-if="householdSize != null" class="meta">HH {{ householdSize }}</p>
      <VulnerabilityBadge v-if="vulnerability" :level="vulnerability" />
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  align-items: flex-start;
}
.body {
  display: grid;
  gap: 0.35rem;
}
h3 {
  margin: 0;
  font-size: var(--text-lg);
}
.meta {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
