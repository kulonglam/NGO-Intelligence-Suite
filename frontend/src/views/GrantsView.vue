<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import BaseButton from '../components/base/BaseButton.vue';
import BaseInput from '../components/base/BaseInput.vue';
import GrantStatusBadge from '../components/domain/GrantStatusBadge.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import SectionCard from '../components/layout/SectionCard.vue';
import DataTable from '../components/data/DataTable.vue';
import DataTableToolbar from '../components/data/DataTableToolbar.vue';
import { useToastStore } from '../stores/toast';
import AlertBanner from '../components/feedback/AlertBanner.vue';

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
const toast = useToastStore();
const grants = ref<Grant[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
const filterQuery = ref('');

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

const columns = computed(() => [
  { key: 'grant_number', label: t('grants.number'), sortable: true },
  { key: 'title', label: t('grants.grantTitle'), sortable: true },
  { key: 'donor_name', label: t('grants.donor'), sortable: true },
  { key: 'budget_display', label: t('grants.budget'), numeric: true },
  { key: 'status', label: t('grants.status') },
]);

const rows = computed(() =>
  grants.value.map((g) => ({
    ...g,
    budget_display: formatMoney(g.total_budget, g.currency, locale.value),
  })),
);

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
    toast.success(t('grants.created'));
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
    <PageHeader
      :eyebrow="t('grants.eyebrow')"
      :title="t('grants.title')"
      :lede="t('grants.lede')"
      heading-id="grants-heading"
    >
      <template #actions>
        <BaseButton variant="ghost" @click="load">{{ t('app.refresh') }}</BaseButton>
      </template>
    </PageHeader>

    <AlertBanner v-if="error" variant="danger">{{ error }}</AlertBanner>

    <DataTableToolbar v-model="filterQuery" />
    <DataTable
      :columns="columns"
      :rows="rows"
      :caption="t('grants.title')"
      :loading="loading"
      :empty-title="t('grants.empty')"
      :empty-body="t('grants.emptyBody')"
      :filter-query="filterQuery"
      row-key="id"
    >
      <template #cell-grant_number="{ row }">
        <RouterLink :to="`/grants/${row.id}`">{{ row.grant_number }}</RouterLink>
      </template>
      <template #cell-status="{ row }">
        <GrantStatusBadge :status="String(row.status)" />
      </template>
    </DataTable>

    <SectionCard class="create-wrap" :title="t('grants.create')" title-id="create-heading">
      <form class="create" @submit.prevent="createGrant" aria-labelledby="create-heading">
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
    </SectionCard>
  </section>
</template>

<style scoped>
.create-wrap {
  margin-block-start: 1.5rem;
}
.create {
  display: grid;
  gap: 0.75rem;
}
.row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}
:deep(td a) {
  color: var(--brand);
  font-weight: 600;
}
@media (max-width: 900px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
