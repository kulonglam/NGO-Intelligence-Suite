<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import BaseButton from '../components/base/BaseButton.vue';
import BaseInput from '../components/base/BaseInput.vue';
import StatusBadge from '../components/base/StatusBadge.vue';

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
    <header>
      <p class="eyebrow">{{ t('reports.eyebrow') }}</p>
      <h1>{{ t('reports.title') }}</h1>
      <p class="lede">{{ t('reports.lede') }}</p>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading">{{ t('app.loading') }}</p>

    <template v-else-if="portfolio">
      <div class="totals" aria-label="Portfolio totals">
        <div>
          <span>{{ t('reports.awardCount') }}</span>
          <strong>{{ portfolio.award_count }}</strong>
        </div>
        <div>
          <span>{{ t('reports.ceiling') }}</span>
          <strong>{{ formatMoney(portfolio.ceiling, 'USD', locale) }}</strong>
        </div>
        <div>
          <span>{{ t('reports.committed') }}</span>
          <strong>{{ formatMoney(portfolio.committed, 'USD', locale) }}</strong>
        </div>
        <div>
          <span>{{ t('reports.remaining') }}</span>
          <strong>{{ formatMoney(portfolio.remaining, 'USD', locale) }}</strong>
        </div>
      </div>

      <h2>{{ t('reports.portfolio') }}</h2>
      <table>
        <thead>
          <tr>
            <th>{{ t('grants.number') }}</th>
            <th>{{ t('grants.grantTitle') }}</th>
            <th>{{ t('grants.status') }}</th>
            <th>{{ t('reports.ceiling') }}</th>
            <th>{{ t('reports.committed') }}</th>
            <th>{{ t('reports.remaining') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in portfolio.awards" :key="a.id">
            <td>{{ a.grant_number }}</td>
            <td>{{ a.title }}</td>
            <td><StatusBadge :status="a.status" /></td>
            <td>{{ formatMoney(a.ceiling, a.currency, locale) }}</td>
            <td>{{ formatMoney(a.committed, a.currency, locale) }}</td>
            <td>{{ formatMoney(a.remaining, a.currency, locale) }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <h2>{{ t('reports.disbursements') }}</h2>
    <form class="range" @submit.prevent="load">
      <BaseInput v-model="from" type="date" :label="t('reports.from')" />
      <BaseInput v-model="to" type="date" :label="t('reports.to')" />
      <BaseButton type="submit">{{ t('app.refresh') }}</BaseButton>
    </form>

    <template v-if="disbursements">
      <p class="lede">
        {{ t('reports.rangeSummary', { count: disbursements.count, total: formatMoney(disbursements.total, 'USD', locale) }) }}
      </p>
      <table>
        <thead>
          <tr>
            <th>{{ t('grants.status') }}</th>
            <th>{{ t('reports.count') }}</th>
            <th>{{ t('reports.total') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in disbursements.by_status" :key="row.status">
            <td><StatusBadge :status="row.status" /></td>
            <td>{{ row.count }}</td>
            <td>{{ formatMoney(row.total, 'USD', locale) }}</td>
          </tr>
          <tr v-if="!disbursements.by_status.length">
            <td colspan="3">{{ t('reports.emptyDisbursements') }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>

<style scoped>
.reports {
  max-width: 1100px;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.75rem;
  color: var(--muted);
  margin: 0;
}
h1 {
  font-family: var(--font-display);
  margin: 0.35rem 0;
}
.lede {
  color: var(--muted);
  max-width: 42rem;
}
.totals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
  margin: 1.5rem 0;
}
.totals div {
  display: grid;
  gap: 0.25rem;
}
.totals span {
  font-size: 0.85rem;
  color: var(--muted);
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-block-end: 2rem;
}
th,
td {
  text-align: start;
  padding: 0.65rem 0.5rem;
  border-bottom: 1px solid var(--border);
}
.range {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: end;
  margin-block-end: 1rem;
}
.error {
  color: var(--danger);
}
</style>
