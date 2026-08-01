<script setup lang="ts">
defineProps<{
  items: Array<{ key: string; label: string; value: string }>;
}>();
</script>

<template>
  <dl class="kv">
    <div v-for="item in items" :key="item.key" class="row">
      <dt>{{ item.label }}</dt>
      <dd>{{ item.value }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.kv {
  margin: 0;
  display: grid;
  gap: 0;
}
.row {
  display: grid;
  grid-template-columns: minmax(7rem, 35%) 1fr;
  gap: var(--space-3);
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--color-border);
}
.row:last-child {
  border-bottom: 0;
}
dt {
  margin: 0;
  font-size: 0.82rem;
  color: var(--color-text-muted);
  font-weight: 600;
}
dd {
  margin: 0;
  font-size: 0.92rem;
  color: var(--color-text);
  word-break: break-word;
}
</style>
