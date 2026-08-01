<script setup lang="ts">
withDefaults(
  defineProps<{
    rows?: number;
    height?: string;
  }>(),
  { rows: 3, height: '1rem' },
);
</script>

<template>
  <div class="skeleton" aria-hidden="true">
    <div
      v-for="n in rows"
      :key="n"
      class="bar"
      :style="{ height, width: n === rows ? '62%' : '100%' }"
    />
  </div>
</template>

<style scoped>
.skeleton {
  display: grid;
  gap: var(--space-3);
}
.bar {
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--paper-2) 0%,
    #f7faf8 45%,
    var(--paper-2) 100%
  );
  background-size: 200% 100%;
  animation: shimmer var(--duration-base) ease-in-out infinite alternate;
}
@keyframes shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: 0 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .bar {
    animation: none;
  }
}
</style>
