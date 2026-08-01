<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ChartPanel from '../data/ChartPanel.vue';

const props = defineProps<{
  categories: string[];
  budget: number[];
  spent: number[];
  title?: string;
  loading?: boolean;
}>();

const { t } = useI18n();

const series = computed(() => [
  { label: t('domain.budget'), values: props.budget },
  { label: t('domain.spent'), values: props.spent },
]);
</script>

<template>
  <ChartPanel
    :title="title ?? t('domain.burnRate')"
    type="bar"
    :categories="categories"
    :series="series"
    :loading="loading"
    :empty-title="t('domain.burnRateEmpty')"
  />
</template>
