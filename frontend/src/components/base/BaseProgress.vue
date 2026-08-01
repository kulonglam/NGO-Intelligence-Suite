<script setup lang="ts">
import { computed, useId } from 'vue';

const props = defineProps<{
  value: number;
  label?: string;
}>();

const id = useId();
const clamped = computed(() => Math.min(100, Math.max(0, Number.isFinite(props.value) ? props.value : 0)));
</script>

<template>
  <div class="field">
    <div v-if="label" class="header">
      <span :id="`${id}-label`" class="label">{{ label }}</span>
      <span class="value">{{ Math.round(clamped) }}%</span>
    </div>
    <div
      class="track"
      role="progressbar"
      :aria-valuenow="Math.round(clamped)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-labelledby="label ? `${id}-label` : undefined"
      :aria-label="label ? undefined : 'progress'"
    >
      <div class="bar" :style="{ width: `${clamped}%` }" />
    </div>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: 0.4rem;
}
.header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.label {
  font-size: 0.92rem;
  font-weight: 500;
  color: var(--color-text);
}
.value {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.track {
  height: 0.55rem;
  border-radius: var(--radius-pill);
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  overflow: hidden;
}
.bar {
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary);
  transition: width var(--duration-base) var(--ease-standard);
}
</style>
