<script setup lang="ts">
defineProps<{
  items: Array<{ id: string; title: string; body?: string; at?: string }>;
}>();
</script>

<template>
  <ol class="timeline">
    <li v-for="item in items" :key="item.id" class="item">
      <div class="marker" aria-hidden="true" />
      <div class="content">
        <div class="head">
          <h3>{{ item.title }}</h3>
          <time v-if="item.at" :datetime="item.at">{{ item.at }}</time>
        </div>
        <p v-if="item.body">{{ item.body }}</p>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
}
.item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-3);
  position: relative;
  padding-block-end: var(--space-4);
}
.item:not(:last-child)::before {
  content: '';
  position: absolute;
  inset-inline-start: 0.4rem;
  top: 1rem;
  bottom: 0;
  width: 2px;
  background: var(--color-border);
}
.marker {
  width: 0.85rem;
  height: 0.85rem;
  margin-block-start: 0.2rem;
  border-radius: 50%;
  background: var(--brand);
  border: 2px solid var(--color-surface);
  box-shadow: 0 0 0 1px var(--color-border);
  z-index: 1;
}
.content {
  min-width: 0;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}
h3 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--color-text);
}
time {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
p {
  margin: var(--space-1) 0 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}
</style>
