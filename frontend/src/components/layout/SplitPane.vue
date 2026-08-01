<script setup lang="ts">
withDefaults(
  defineProps<{
    /** CSS grid-template-columns value for desktop layout */
    ratio?: string;
  }>(),
  {
    ratio: '1fr 1fr',
  },
);
</script>

<template>
  <div class="split" :style="{ '--split-ratio': ratio }">
    <div class="pane primary">
      <slot name="primary" />
    </div>
    <div class="pane secondary">
      <slot name="secondary" />
    </div>
  </div>
</template>

<style scoped>
.split {
  display: grid;
  grid-template-columns: var(--split-ratio, 1fr 1fr);
  gap: var(--space-5);
  align-items: start;
}
.pane {
  min-width: 0;
}
@media (max-width: 768px) {
  .split {
    grid-template-columns: 1fr;
  }
}
</style>
