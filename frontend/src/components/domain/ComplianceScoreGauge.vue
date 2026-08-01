<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    score: number;
    label?: string;
    size?: number;
  }>(),
  { size: 140 },
);

const clamped = computed(() => Math.min(100, Math.max(0, Number(props.score) || 0)));
const r = computed(() => props.size * 0.36);
const c = computed(() => 2 * Math.PI * r.value);
const offset = computed(() => c.value * (1 - clamped.value / 100));
const tone = computed(() => {
  if (clamped.value >= 80) return 'var(--color-success)';
  if (clamped.value >= 50) return 'var(--color-warning)';
  return 'var(--color-danger)';
});
</script>

<template>
  <div class="gauge" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :viewBox="`0 0 ${size} ${size}`" role="img" :aria-label="label ?? `Score ${clamped}`">
      <circle
        class="track"
        :cx="size / 2"
        :cy="size / 2"
        :r="r"
        fill="none"
        stroke-width="10"
      />
      <circle
        class="value"
        :cx="size / 2"
        :cy="size / 2"
        :r="r"
        fill="none"
        stroke-width="10"
        :stroke="tone"
        :stroke-dasharray="c"
        :stroke-dashoffset="offset"
        stroke-linecap="round"
        :transform="`rotate(-90 ${size / 2} ${size / 2})`"
      />
      <text :x="size / 2" :y="size / 2" text-anchor="middle" dominant-baseline="central" class="num">
        {{ Math.round(clamped) }}
      </text>
    </svg>
    <p v-if="label" class="label">{{ label }}</p>
  </div>
</template>

<style scoped>
.gauge {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
}
.track {
  stroke: var(--color-border);
}
.num {
  fill: var(--color-text);
  font-size: 1.6rem;
  font-weight: 700;
  font-family: var(--font-display);
}
.label {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-weight: 600;
}
</style>
