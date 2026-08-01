<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import { useTenantStore } from '../stores/tenant';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader.vue';
import SectionCard from '../components/layout/SectionCard.vue';
import StatCard from '../components/data/StatCard.vue';
import DateDisplay from '../components/base/DateDisplay.vue';

const { t } = useI18n();
const auth = useAuthStore();
const tenant = useTenantStore();

const welcome = computed(() =>
  auth.user ? t('home.welcomeNamed', { name: auth.user.display_name }) : t('home.welcome'),
);

const loading = ref(true);
const grantCount = ref<number | null>(null);
const expenseCount = ref<number | null>(null);
const payrollCount = ref<number | null>(null);
const kpiCount = ref<number | null>(null);
const today = new Date();

const quickLinks = computed(() =>
  [
    {
      to: '/grants',
      labelKey: 'home.goGrants',
      module: 'grants',
      anyOf: ['grant:award:list', 'grant:award:read'],
    },
    {
      to: '/finance',
      labelKey: 'home.goFinance',
      module: 'finance',
      anyOf: ['grant:expenditure:read', 'grant:budget:read'],
    },
    {
      to: '/payroll',
      labelKey: 'home.goPayroll',
      module: 'payroll',
      anyOf: ['payroll:run:read'],
    },
    {
      to: '/intelligence',
      labelKey: 'home.goIntelligence',
      module: 'intelligence',
      anyOf: ['reporting:dashboard:read', 'grant:report:read'],
    },
  ].filter(
    (link) => auth.canAny(link.anyOf) && tenant.moduleEnabled(link.module),
  ),
);

onMounted(async () => {
  loading.value = true;
  try {
    const [grants, expenses, runs, dash] = await Promise.allSettled([
      api<unknown[]>('/v1/grant/grants'),
      api<unknown[]>('/v1/grant/expenses'),
      api<unknown[]>('/v1/hr/payroll-runs'),
      api<{ kpis?: unknown[] }>('/v1/analytics/dashboard'),
    ]);
    if (grants.status === 'fulfilled') grantCount.value = grants.value.length;
    if (expenses.status === 'fulfilled') expenseCount.value = expenses.value.length;
    if (runs.status === 'fulfilled') payrollCount.value = runs.value.length;
    if (dash.status === 'fulfilled') kpiCount.value = dash.value.kpis?.length ?? 0;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section aria-labelledby="home-heading">
    <PageHeader
      :eyebrow="t('home.eyebrow')"
      :title="welcome"
      :lede="t('home.lede')"
      heading-id="home-heading"
    >
      <template #actions>
        <p class="today">
          <span class="sr-only">{{ t('home.today') }}</span>
          <DateDisplay :value="today" />
        </p>
      </template>
    </PageHeader>

    <div class="stats">
      <StatCard
        :label="t('home.statGrants')"
        :loading="loading"
        :value="grantCount == null ? null : String(grantCount)"
        :empty="!loading && grantCount == null"
      />
      <StatCard
        :label="t('home.statExpenses')"
        :loading="loading"
        :value="expenseCount == null ? null : String(expenseCount)"
        :empty="!loading && expenseCount == null"
      />
      <StatCard
        :label="t('home.statPayroll')"
        :loading="loading"
        :value="payrollCount == null ? null : String(payrollCount)"
        :empty="!loading && payrollCount == null"
      />
      <StatCard
        :label="t('home.statKpis')"
        :loading="loading"
        :value="kpiCount == null ? null : String(kpiCount)"
        :empty="!loading && kpiCount == null"
        :hint="grantCount == null && !loading ? t('home.statsEmpty') : undefined"
      />
    </div>

    <SectionCard v-if="quickLinks.length" :title="t('home.quickLinks')" title-id="quick-links">
      <div class="links">
        <RouterLink v-for="link in quickLinks" :key="link.to" :to="link.to">
          {{ t(link.labelKey) }}
        </RouterLink>
      </div>
    </SectionCard>

    <div class="grid">
      <article>
        <h2>{{ t('home.identityTitle') }}</h2>
        <p>{{ t('home.identityBody') }}</p>
      </article>
      <article>
        <h2>{{ t('home.tenancyTitle') }}</h2>
        <p>{{ t('home.tenancyBody') }}</p>
      </article>
      <article>
        <h2>{{ t('home.grantsTitle') }}</h2>
        <p>{{ t('home.grantsBody') }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.today {
  margin: 0;
  font-size: 0.95rem;
  color: var(--color-text-muted);
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  margin-block-end: 1.5rem;
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.links a {
  padding: 0.55rem 0.9rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--brand);
  font-weight: 600;
}
.links a:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
.grid {
  margin-block-start: 1.5rem;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}
article {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.1rem;
}
article h2 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}
article p {
  margin: 0;
  color: var(--ink-muted);
}
@media (max-width: 900px) {
  .stats,
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
