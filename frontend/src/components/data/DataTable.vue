<script setup lang="ts">
import { computed, ref } from 'vue';
import EmptyState from '../feedback/EmptyState.vue';
import SkeletonBlock from '../feedback/SkeletonBlock.vue';

export type DataColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  numeric?: boolean;
};

const props = defineProps<{
  columns: DataColumn[];
  rows: Array<Record<string, unknown>>;
  caption: string;
  loading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  rowKey?: string;
}>();

const sortKey = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc'>('asc');

const sorted = computed(() => {
  if (!sortKey.value) return props.rows;
  const key = sortKey.value;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return [...props.rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return -1 * dir;
    if (bv == null) return 1 * dir;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
  });
});

function toggleSort(col: DataColumn) {
  if (!col.sortable) return;
  if (sortKey.value === col.key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = col.key;
    sortDir.value = 'asc';
  }
}

function keyFor(row: Record<string, unknown>, index: number) {
  if (props.rowKey && row[props.rowKey] != null) return String(row[props.rowKey]);
  return String(index);
}
</script>

<template>
  <div class="wrap">
    <div v-if="loading" class="pad">
      <SkeletonBlock :rows="4" height="1.25rem" />
    </div>
    <div v-else-if="!rows.length" class="pad">
      <EmptyState :title="emptyTitle ?? 'No rows'" :body="emptyBody">
        <slot name="empty" />
      </EmptyState>
    </div>
    <table v-else>
      <caption class="sr-only">{{ caption }}</caption>
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            scope="col"
            :aria-sort="
              sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
            "
          >
            <button v-if="col.sortable" type="button" class="sort" @click="toggleSort(col)">
              {{ col.label }}
              <span aria-hidden="true">{{
                sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : ''
              }}</span>
            </button>
            <span v-else>{{ col.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in sorted" :key="keyFor(row, index)">
          <td
            v-for="col in columns"
            :key="col.key"
            :class="{ numeric: col.numeric }"
            :dir="col.numeric ? 'ltr' : undefined"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
              {{ row[col.key] }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.wrap {
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: auto;
}
.pad {
  padding: var(--space-4);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}
th,
td {
  text-align: start;
  padding: 0.75rem 0.9rem;
  border-bottom: 1px solid var(--color-border);
}
th {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  white-space: nowrap;
}
td.numeric {
  font-variant-numeric: tabular-nums;
}
.sort {
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
}
.sort:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
</style>
