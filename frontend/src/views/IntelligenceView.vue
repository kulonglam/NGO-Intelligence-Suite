<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '../components/base/BaseButton.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import StatCard from '../components/data/StatCard.vue';
import ChartPanel from '../components/data/ChartPanel.vue';
import SkeletonBlock from '../components/feedback/SkeletonBlock.vue';
import EmptyState from '../components/feedback/EmptyState.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';
import { api } from '../lib/api';
import { useToastStore } from '../stores/toast';

const { t } = useI18n();
const toast = useToastStore();
const asOf = ref('');
const kpis = ref<Array<{ kpi_code: string; value_numeric: string | number }>>([]);
const error = ref<string | null>(null);
const busy = ref(false);
const loading = ref(true);

const kpiCategories = computed(() => kpis.value.map((k) => k.kpi_code));
const kpiSeries = computed(() => [
  { label: t('intelligence.title'), values: kpis.value.map((k) => Number(k.value_numeric)) },
]);

async function load() {
  busy.value = true;
  loading.value = true;
  error.value = null;
  try {
    const dash = await api<{
      as_of: string;
      kpis: Array<{ kpi_code: string; value_numeric: string | number }>;
    }>('/v1/analytics/dashboard');
    asOf.value = dash.as_of;
    kpis.value = dash.kpis;
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('intelligence.failed');
  } finally {
    busy.value = false;
    loading.value = false;
  }
}

async function refresh() {
  busy.value = true;
  try {
    await api('/v1/analytics/kpis/refresh', { method: 'POST', body: '{}' });
    await load();
    toast.success(t('intelligence.refreshed'));
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('intelligence.failed');
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <section class="page">
    <PageHeader
      :eyebrow="t('intelligence.eyebrow')"
      :title="t('intelligence.title')"
      :lede="t('intelligence.lede')"
    >
      <template #actions>
        <BaseButton :disabled="busy" @click="refresh">{{ t('intelligence.refresh') }}</BaseButton>
      </template>
    </PageHeader>
    <p class="asof">{{ t('intelligence.asOf', { at: asOf || '—' }) }}</p>
    <AlertBanner v-if="error" variant="danger">{{ error }}</AlertBanner>

    <SkeletonBlock v-if="loading" :rows="3" height="4rem" />
    <EmptyState
      v-else-if="!kpis.length"
      :title="t('intelligence.empty')"
      :body="t('intelligence.emptyBody')"
    >
      <BaseButton :disabled="busy" @click="refresh">{{ t('intelligence.refresh') }}</BaseButton>
    </EmptyState>
    <template v-else>
      <div class="grid">
        <StatCard
          v-for="k in kpis"
          :key="k.kpi_code"
          :label="k.kpi_code"
          :value="String(k.value_numeric)"
        />
      </div>
      <ChartPanel
        class="chart"
        :title="t('intelligence.title')"
        type="bar"
        :categories="kpiCategories"
        :series="kpiSeries"
      />
    </template>
    <p class="note">{{ t('intelligence.kanon') }}</p>
  </section>
</template>

<style scoped>
.asof {
  font-size: 0.9rem;
  opacity: 0.8;
  margin: -0.5rem 0 1rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}
.chart {
  margin-block-start: 1.25rem;
}
.note {
  font-size: 0.85rem;
  opacity: 0.75;
  margin-block-start: 1.25rem;
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
