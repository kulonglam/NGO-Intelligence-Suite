<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import BaseButton from '../components/base/BaseButton.vue';
import BaseInput from '../components/base/BaseInput.vue';
import StatusBadge from '../components/base/StatusBadge.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import SectionCard from '../components/layout/SectionCard.vue';
import DataTable from '../components/data/DataTable.vue';
import DataTableToolbar from '../components/data/DataTableToolbar.vue';
import SkeletonBlock from '../components/feedback/SkeletonBlock.vue';
import StatCard from '../components/data/StatCard.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';

type Portfolio = {
  award_count: number;
  ceiling: string;
  committed: string;
  remaining: string;
  awards: Array<{
    id: string;
    grant_number: string;
    title: string;
    currency: string;
    status: string;
    ceiling: string;
    committed: string;
    remaining: string;
  }>;
};

type DisbursementReport = {
  from: string;
  to: string;
  count: number;
  total: string;
  by_status: Array<{ status: string; count: string; total: string }>;
};

const { t, locale } = useI18n();
const portfolio = ref<Portfolio | null>(null);
const disbursements = ref<DisbursementReport | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);
const from = ref('2026-01-01');
const to = ref('2026-12-31');
const awardFilter = ref('');

const awardColumns = computed(() => [
  { key: 'grant_number', label: t('grants.number'), sortable: true },
  { key: 'title', label: t('grants.grantTitle'), sortable: true },
  { key: 'status', label: t('grants.status') },
  { key: 'ceiling_display', label: t('reports.ceiling'), numeric: true },
  { key: 'committed_display', label: t('reports.committed'), numeric: true },
  { key: 'remaining_display', label: t('reports.remaining'), numeric: true },
]);

const awardRows = computed(() =>
  (portfolio.value?.awards ?? []).map((a) => ({
    ...a,
    ceiling_display: formatMoney(a.ceiling, a.currency, locale.value),
    committed_display: formatMoney(a.committed, a.currency, locale.value),
    remaining_display: formatMoney(a.remaining, a.currency, locale.value),
  })),
);

const statusColumns = computed(() => [
  { key: 'status', label: t('grants.status') },
  { key: 'count', label: t('reports.count'), numeric: true },
  { key: 'total_display', label: t('reports.total'), numeric: true },
]);

const statusRows = computed(() =>
  (disbursements.value?.by_status ?? []).map((row) => ({
    ...row,
    total_display: formatMoney(row.total, 'USD', locale.value),
  })),
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [p, d] = await Promise.all([
      api<Portfolio>('/v1/grant/reports/portfolio'),
      api<DisbursementReport>(
        `/v1/grant/reports/disbursements?from=${encodeURIComponent(from.value)}&to=${encodeURIComponent(to.value)}`,
      ),
    ]);
    portfolio.value = p;
    disbursements.value = d;
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('reports.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <section class="reports">
    <PageHeader
      :eyebrow="t('reports.eyebrow')"
      :title="t('reports.title')"
      :lede="t('reports.lede')"
    >
      <template #actions>
        <BaseButton variant="ghost" :disabled="loading" @click="load">{{ t('app.refresh') }}</BaseButton>
      </template>
    </PageHeader>

    <AlertBanner v-if="error" variant="danger">{{ error }}</AlertBanner>
    <SkeletonBlock v-if="loading" :rows="6" height="1.2rem" />

    <template v-else-if="portfolio">
      <div class="totals" aria-label="Portfolio totals">
        <StatCard :label="t('reports.awardCount')" :value="String(portfolio.award_count)" />
        <StatCard
          :label="t('reports.ceiling')"
          :value="formatMoney(portfolio.ceiling, 'USD', locale)"
        />
        <StatCard
          :label="t('reports.committed')"
          :value="formatMoney(portfolio.committed, 'USD', locale)"
        />
        <StatCard
          :label="t('reports.remaining')"
          :value="formatMoney(portfolio.remaining, 'USD', locale)"
        />
      </div>

      <SectionCard :title="t('reports.portfolio')" title-id="portfolio-heading" class="block">
        <DataTableToolbar v-model="awardFilter" />
        <DataTable
          :columns="awardColumns"
          :rows="awardRows"
          :caption="t('reports.portfolio')"
          :filter-query="awardFilter"
          row-key="id"
        >
          <template #cell-status="{ row }">
            <StatusBadge :status="String(row.status)" />
          </template>
        </DataTable>
      </SectionCard>
    </template>

    <SectionCard :title="t('reports.disbursements')" title-id="disb-heading" class="block">
      <form class="range" @submit.prevent="load">
        <BaseInput v-model="from" type="date" :label="t('reports.from')" />
        <BaseInput v-model="to" type="date" :label="t('reports.to')" />
        <BaseButton type="submit">{{ t('app.refresh') }}</BaseButton>
      </form>

      <template v-if="disbursements">
        <p class="lede">
          {{
            t('reports.rangeSummary', {
              count: disbursements.count,
              total: formatMoney(disbursements.total, 'USD', locale),
            })
          }}
        </p>
        <DataTable
          :columns="statusColumns"
          :rows="statusRows"
          :caption="t('reports.disbursements')"
          :empty-title="t('reports.emptyDisbursements')"
          :paginate="false"
          row-key="status"
        >
          <template #cell-status="{ row }">
            <StatusBadge :status="String(row.status)" />
          </template>
        </DataTable>
      </template>
    </SectionCard>
  </section>
</template>

<style scoped>
.reports {
  max-width: 1100px;
}
.block {
  margin-block-end: 1.25rem;
}
.lede {
  color: var(--color-text-muted);
  max-width: 42rem;
  margin: 0 0 0.75rem;
}
.totals {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  margin: 0 0 1.5rem;
}
.range {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: end;
  margin-block-end: 1rem;
}
@media (max-width: 900px) {
  .totals {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
