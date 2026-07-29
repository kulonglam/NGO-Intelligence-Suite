<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import BaseButton from '../components/base/BaseButton.vue';
import BaseInput from '../components/base/BaseInput.vue';
import StatusBadge from '../components/base/StatusBadge.vue';

type Grant = {
  id: string;
  grant_number: string;
  title: string;
  donor_name: string;
  currency: string;
  total_budget: string;
  status: string;
  start_date: string;
  end_date: string;
};

const { t, locale } = useI18n();
const grants = ref<Grant[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);

const form = ref({
  grant_number: '',
  title: '',
  donor_name: '',
  currency: 'USD',
  total_budget: '100000.00',
  start_date: '2026-07-01',
  end_date: '2026-12-31',
  status: 'draft' as const,
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    grants.value = await api<Grant[]>('/v1/grant/grants');
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('grants.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function createGrant() {
  error.value = null;
  try {
    await api('/v1/grant/grants', {
      method: 'POST',
      body: JSON.stringify(form.value),
    });
    form.value.grant_number = '';
    form.value.title = '';
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('grants.createFailed');
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <section aria-labelledby="grants-heading">
    <div class="head">
      <div>
        <p class="eyebrow">{{ t('grants.eyebrow') }}</p>
        <h1 id="grants-heading">{{ t('grants.title') }}</h1>
      </div>
      <BaseButton variant="ghost" @click="load">{{ t('app.refresh') }}</BaseButton>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading">{{ t('app.loading') }}</p>

    <div class="table-wrap" v-if="!loading">
      <table>
        <caption class="sr-only">{{ t('grants.title') }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('grants.number') }}</th>
            <th scope="col">{{ t('grants.grantTitle') }}</th>
            <th scope="col">{{ t('grants.donor') }}</th>
            <th scope="col">{{ t('grants.budget') }}</th>
            <th scope="col">{{ t('grants.status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in grants" :key="g.id">
            <td>
              <RouterLink :to="`/grants/${g.id}`">{{ g.grant_number }}</RouterLink>
            </td>
            <td>{{ g.title }}</td>
            <td>{{ g.donor_name }}</td>
            <td class="bidi-isolate" dir="ltr">
              {{ formatMoney(g.total_budget, g.currency, locale) }}
            </td>
            <td><StatusBadge :status="g.status" /></td>
          </tr>
          <tr v-if="grants.length === 0">
            <td colspan="5">{{ t('grants.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <form class="create" @submit.prevent="createGrant" aria-labelledby="create-heading">
      <h2 id="create-heading">{{ t('grants.create') }}</h2>
      <div class="row">
        <BaseInput v-model="form.grant_number" :label="t('grants.number')" required ltr />
        <BaseInput v-model="form.title" :label="t('grants.grantTitle')" required />
      </div>
      <div class="row">
        <BaseInput v-model="form.donor_name" :label="t('grants.donor')" required />
        <BaseInput v-model="form.total_budget" :label="t('grants.budget')" required ltr />
        <BaseInput
          v-model="form.currency"
          :label="t('grants.currency')"
          :maxlength="3"
          required
          ltr
        />
      </div>
      <BaseButton type="submit" variant="secondary">{{ t('grants.submit') }}</BaseButton>
    </form>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 1rem;
  margin-bottom: 1.1rem;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
  color: var(--brand);
  font-weight: 600;
  margin: 0;
}
h1 {
  margin: 0.4rem 0 0;
  color: var(--brand-deep);
}
.table-wrap {
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow: auto;
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
  border-bottom: 1px solid var(--line);
}
th {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
}
td a {
  color: var(--brand);
  font-weight: 600;
}
.create {
  margin-block-start: 1.5rem;
  padding: 1.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.84);
  display: grid;
  gap: 0.75rem;
}
.row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}
.error {
  color: var(--danger);
}
@media (max-width: 900px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
