<script setup lang="ts">
import { computed } from 'vue';
import EmptyState from '../feedback/EmptyState.vue';
import SkeletonLoader from './SkeletonLoader.vue';

export type ChartSeries = { label: string; values: number[] };

const props = defineProps<{
  title: string;
  type: 'bar' | 'line';
  series: ChartSeries[];
  categories: string[];
  loading?: boolean;
  emptyTitle?: string;
}>();

const W = 480;
const H = 220;
const PAD = { t: 16, r: 16, b: 36, l: 40 };
const COLORS = [
  'var(--color-primary)',
  'var(--color-accent, var(--accent))',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-info)',
];

const hasData = computed(
  () =>
    props.categories.length > 0 &&
    props.series.some((s) => s.values.some((v) => Number.isFinite(v))),
);

const maxVal = computed(() => {
  let m = 0;
  for (const s of props.series) {
    for (const v of s.values) if (Number.isFinite(v) && v > m) m = v;
  }
  return m > 0 ? m : 1;
});

const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

function xAt(i: number, n: number) {
  if (n <= 1) return PAD.l + plotW / 2;
  return PAD.l + (i / (n - 1)) * plotW;
}

function yAt(v: number) {
  return PAD.t + plotH - (v / maxVal.value) * plotH;
}

function barWidth(n: number, seriesCount: number) {
  const group = plotW / Math.max(n, 1);
  return Math.max(4, (group * 0.7) / Math.max(seriesCount, 1));
}

const linePaths = computed(() =>
  props.series.map((s) => {
    const n = props.categories.length;
    const pts = s.values
      .slice(0, n)
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i, n)} ${yAt(v)}`)
      .join(' ');
    return pts;
  }),
);
</script>

<template>
  <section class="panel">
    <h3 class="title">{{ title }}</h3>
    <SkeletonLoader v-if="loading" :rows="4" height="2.5rem" />
    <EmptyState v-else-if="!hasData" :title="emptyTitle ?? 'No chart data'" />
    <div v-else class="chart-wrap">
      <svg
        class="chart"
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        :aria-label="title"
      >
        <!-- y grid -->
        <g class="grid" aria-hidden="true">
          <line
            v-for="t in 4"
            :key="t"
            :x1="PAD.l"
            :x2="W - PAD.r"
            :y1="PAD.t + (plotH * (t - 1)) / 3"
            :y2="PAD.t + (plotH * (t - 1)) / 3"
          />
        </g>
        <g v-if="type === 'bar'">
          <template v-for="(s, si) in series" :key="s.label">
            <rect
              v-for="(v, i) in s.values.slice(0, categories.length)"
              :key="`${si}-${i}`"
              :x="
                PAD.l +
                (i + 0.15) * (plotW / categories.length) +
                si * barWidth(categories.length, series.length)
              "
              :y="yAt(v)"
              :width="barWidth(categories.length, series.length)"
              :height="Math.max(0, PAD.t + plotH - yAt(v))"
              :fill="COLORS[si % COLORS.length]"
              rx="2"
            />
          </template>
        </g>
        <g v-else>
          <path
            v-for="(d, si) in linePaths"
            :key="series[si]?.label"
            :d="d"
            fill="none"
            :stroke="COLORS[si % COLORS.length]"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <template v-for="(s, si) in series" :key="`p-${s.label}`">
            <circle
              v-for="(v, i) in s.values.slice(0, categories.length)"
              :key="`${si}-c-${i}`"
              :cx="xAt(i, categories.length)"
              :cy="yAt(v)"
              r="3.5"
              :fill="COLORS[si % COLORS.length]"
            />
          </template>
        </g>
        <g class="axis" dir="ltr">
          <text
            v-for="(c, i) in categories"
            :key="c"
            :x="type === 'bar' ? PAD.l + (i + 0.5) * (plotW / categories.length) : xAt(i, categories.length)"
            :y="H - 10"
            text-anchor="middle"
          >
            {{ c }}
          </text>
        </g>
      </svg>
      <ul class="legend">
        <li v-for="(s, si) in series" :key="s.label">
          <span class="swatch" :style="{ background: COLORS[si % COLORS.length] }" />
          {{ s.label }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-3);
}
.title {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--brand-deep);
}
.chart-wrap {
  display: grid;
  gap: var(--space-3);
}
.chart {
  width: 100%;
  max-width: 36rem;
  height: auto;
}
.grid line {
  stroke: var(--color-border);
  stroke-width: 1;
}
.axis text {
  fill: var(--color-text-muted);
  font-size: 10px;
  font-family: var(--font-sans);
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.swatch {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
}
</style>
