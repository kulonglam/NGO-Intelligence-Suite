<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { useI18n } from 'vue-i18n';
import EmptyState from '../feedback/EmptyState.vue';
import ErrorState from '../feedback/ErrorState.vue';
import SkeletonBlock from '../feedback/SkeletonBlock.vue';
import Pagination from './Pagination.vue';

export type DataColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  numeric?: boolean;
};

const ROW_H = 44;
const AUTO_THRESHOLD = 50;

const props = withDefaults(
  defineProps<{
    columns: DataColumn[];
    rows: Array<Record<string, unknown>>;
    caption: string;
    loading?: boolean;
    error?: string | null;
    emptyTitle?: string;
    emptyBody?: string;
    rowKey?: string;
    filterQuery?: string;
    pageSize?: number;
    paginate?: boolean;
    selectable?: boolean;
    selected?: string[];
    virtualize?: boolean | 'auto';
  }>(),
  {
    pageSize: 10,
    paginate: true,
    filterQuery: '',
    selectable: false,
    selected: () => [],
    virtualize: 'auto',
  },
);

const emit = defineEmits<{
  'update:selected': [string[]];
  retry: [];
}>();

const { t } = useI18n();
const sortKey = ref<string | null>(null);
const sortDir = ref<'asc' | 'desc'>('asc');
const page = ref(1);
const pageSizeLocal = ref(props.pageSize);
const scrollParent = ref<HTMLElement | null>(null);

watch(
  () => props.filterQuery,
  () => {
    page.value = 1;
  },
);

watch(
  () => props.pageSize,
  (n) => {
    pageSizeLocal.value = n;
  },
);

const filtered = computed(() => {
  const q = (props.filterQuery ?? '').trim().toLowerCase();
  if (!q) return props.rows;
  return props.rows.filter((row) =>
    Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)),
  );
});

const sorted = computed(() => {
  if (!sortKey.value) return filtered.value;
  const key = sortKey.value;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return [...filtered.value].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return -1 * dir;
    if (bv == null) return 1 * dir;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
  });
});

const pageCount = computed(() => {
  if (!props.paginate) return 1;
  return Math.max(1, Math.ceil(sorted.value.length / pageSizeLocal.value));
});

const pageRows = computed(() => {
  if (!props.paginate) return sorted.value;
  const start = (page.value - 1) * pageSizeLocal.value;
  return sorted.value.slice(start, start + pageSizeLocal.value);
});

const useVirtual = computed(() => {
  if (props.virtualize === true) return pageRows.value.length > 0;
  if (props.virtualize === false) return false;
  return pageRows.value.length >= AUTO_THRESHOLD;
});

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: useVirtual.value ? pageRows.value.length : 0,
    getScrollElement: () => scrollParent.value,
    estimateSize: () => ROW_H,
    overscan: 8,
  })),
);

const virtualItems = computed(() => (useVirtual.value ? rowVirtualizer.value.getVirtualItems() : []));
const totalSize = computed(() => (useVirtual.value ? rowVirtualizer.value.getTotalSize() : 0));

const pageKeys = computed(() => pageRows.value.map((row, index) => keyFor(row, index)));

const allPageSelected = computed(() => {
  if (!pageKeys.value.length) return false;
  const set = new Set(props.selected ?? []);
  return pageKeys.value.every((k) => set.has(k));
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

function isSelected(row: Record<string, unknown>, index: number) {
  return (props.selected ?? []).includes(keyFor(row, index));
}

function toggleRow(row: Record<string, unknown>, index: number) {
  const key = keyFor(row, index);
  const next = new Set(props.selected ?? []);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  emit('update:selected', [...next]);
}

function toggleAllOnPage() {
  const next = new Set(props.selected ?? []);
  if (allPageSelected.value) {
    for (const k of pageKeys.value) next.delete(k);
  } else {
    for (const k of pageKeys.value) next.add(k);
  }
  emit('update:selected', [...next]);
}

function onPageSize(n: number) {
  pageSizeLocal.value = n;
  page.value = 1;
}
</script>

<template>
  <div class="wrap">
    <div v-if="loading" class="pad">
      <SkeletonBlock :rows="4" height="1.25rem" />
    </div>
    <div v-else-if="error" class="pad">
      <ErrorState :body="error" @retry="emit('retry')">
        <slot name="error" />
      </ErrorState>
    </div>
    <div v-else-if="!filtered.length" class="pad">
      <EmptyState :title="emptyTitle ?? t('table.empty')" :body="emptyBody">
        <slot name="empty" />
      </EmptyState>
    </div>
    <template v-else>
      <p class="count" aria-live="polite">
        {{ t('table.showing', { shown: pageRows.length, total: filtered.length }) }}
      </p>
      <div ref="scrollParent" class="scroll" :class="{ virtual: useVirtual }">
        <table>
          <caption class="sr-only">{{ caption }}</caption>
          <thead>
            <tr>
              <th v-if="selectable" scope="col" class="check">
                <input
                  type="checkbox"
                  :checked="allPageSelected"
                  :aria-label="'Select all on page'"
                  @change="toggleAllOnPage"
                />
              </th>
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
          <tbody v-if="!useVirtual">
            <tr v-for="(row, index) in pageRows" :key="keyFor(row, index)">
              <td v-if="selectable" class="check">
                <input
                  type="checkbox"
                  :checked="isSelected(row, index)"
                  :aria-label="'Select row'"
                  @change="toggleRow(row, index)"
                />
              </td>
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
          <tbody v-else class="virt-body">
            <tr aria-hidden="true" class="spacer">
              <td
                :colspan="columns.length + (selectable ? 1 : 0)"
                :style="{ height: `${virtualItems[0]?.start ?? 0}px`, padding: 0, border: 0 }"
              />
            </tr>
            <tr
              v-for="item in virtualItems"
              :key="keyFor(pageRows[item.index]!, item.index)"
              :style="{ height: `${ROW_H}px` }"
            >
              <td v-if="selectable" class="check">
                <input
                  type="checkbox"
                  :checked="isSelected(pageRows[item.index]!, item.index)"
                  :aria-label="'Select row'"
                  @change="toggleRow(pageRows[item.index]!, item.index)"
                />
              </td>
              <td
                v-for="col in columns"
                :key="col.key"
                :class="{ numeric: col.numeric }"
                :dir="col.numeric ? 'ltr' : undefined"
              >
                <slot
                  :name="`cell-${col.key}`"
                  :row="pageRows[item.index]!"
                  :value="pageRows[item.index]![col.key]"
                >
                  {{ pageRows[item.index]![col.key] }}
                </slot>
              </td>
            </tr>
            <tr aria-hidden="true" class="spacer">
              <td
                :colspan="columns.length + (selectable ? 1 : 0)"
                :style="{
                  height: `${Math.max(0, totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0))}px`,
                  padding: 0,
                  border: 0,
                }"
              />
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination
        v-if="paginate && pageCount > 1"
        :page="page"
        :page-count="pageCount"
        :page-size="pageSizeLocal"
        @update:page="page = $event"
        @update:page-size="onPageSize"
      />
    </template>
  </div>
</template>

<style scoped>
.wrap {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.pad {
  padding: var(--space-4);
}
.count {
  margin: 0;
  padding: 0.65rem 0.9rem 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.scroll {
  overflow: auto;
}
.scroll.virtual {
  max-height: 28rem;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
}
thead {
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
  background: var(--color-surface);
}
th,
td {
  text-align: start;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid var(--color-border);
}
th {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  white-space: nowrap;
}
th.check,
td.check {
  width: 2.5rem;
  text-align: center;
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
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  accent-color: var(--color-primary);
}
</style>
