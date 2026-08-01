<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import BaseButton from '../base/BaseButton.vue';

const props = withDefaults(
  defineProps<{
    page: number;
    pageCount: number;
    pageSize: number;
    pageSizeOptions?: number[];
  }>(),
  { pageSizeOptions: () => [10, 25] },
);

const emit = defineEmits<{
  'update:page': [number];
  'update:pageSize': [number];
}>();

const { t } = useI18n();

function prev() {
  emit('update:page', Math.max(1, props.page - 1));
}

function next() {
  emit('update:page', Math.min(props.pageCount, props.page + 1));
}

function onPageSizeChange(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value);
  emit('update:pageSize', value);
  emit('update:page', 1);
}
</script>

<template>
  <div class="pager">
    <BaseButton variant="ghost" :disabled="page <= 1" :aria-label="t('table.prev')" @click="prev">
      {{ t('table.prev') }}
    </BaseButton>
    <span>{{ t('table.page', { page, pages: pageCount }) }}</span>
    <BaseButton
      variant="ghost"
      :disabled="page >= pageCount"
      :aria-label="t('table.next')"
      @click="next"
    >
      {{ t('table.next') }}
    </BaseButton>
    <label class="size">
      <span class="sr-only">{{ t('table.pageSize') }}</span>
      <select :value="pageSize" @change="onPageSizeChange">
        <option v-for="opt in pageSizeOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.85rem;
  border-top: 1px solid var(--color-border);
  font-size: 0.9rem;
}
.size select {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.5rem;
  background: var(--color-surface);
}
</style>
