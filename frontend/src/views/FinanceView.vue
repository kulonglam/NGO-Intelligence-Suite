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
import SkeletonBlock from '../components/feedback/SkeletonBlock.vue';

type Coa = { id: string; account_code: string; name: string; account_type: string };
type Expense = {
  id: string;
  expense_number: string;
  description: string;
  amount: string;
  currency: string;
  status: string;
  expense_date: string;
};
type Grant = { id: string; grant_number: string; title: string };
type Bva = {
  fx_stale?: boolean;
  grants: Array<{
    grant_number: string;
    total_budget: string;
    disbursed: string;
    expenses_approved: string;
    currency: string;
  }>;
};

const { t, locale } = useI18n();
const coa = ref<Coa[]>([]);
const expenses = ref<Expense[]>([]);
const grants = ref<Grant[]>([]);
const bva = ref<Bva | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);
const busy = ref(false);

const coaForm = ref({
  account_code: '',
  name: '',
  account_type: 'expense',
});
const expenseForm = ref({
  grant_id: '',
  account_id: '',
  expense_number: '',
  description: '',
  amount: '',
  currency: 'USD',
  expense_date: new Date().toISOString().slice(0, 10),
});

const coaColumns = computed(() => [
  { key: 'account_code', label: t('finance.accountCode'), sortable: true },
  { key: 'name', label: t('finance.accountName'), sortable: true },
  { key: 'account_type', label: t('finance.accountType') },
]);

const expenseRows = computed(() =>
  expenses.value.map((e) => ({
    ...e,
    amount_display: formatMoney(e.amount, e.currency, locale.value),
  })),
);

const expenseColumns = computed(() => [
  { key: 'expense_number', label: t('finance.expenseNumber'), sortable: true },
  { key: 'description', label: t('finance.description') },
  { key: 'amount_display', label: t('grants.budget'), numeric: true },
  { key: 'status', label: t('grants.status') },
  { key: 'actions', label: '' },
]);

const bvaRows = computed(() =>
  (bva.value?.grants ?? []).map((line) => ({
    ...line,
    budget_display: formatMoney(line.total_budget, line.currency || 'USD', locale.value),
    disbursed_display: formatMoney(line.disbursed, line.currency || 'USD', locale.value),
    expense_display: formatMoney(line.expenses_approved, line.currency || 'USD', locale.value),
  })),
);

const bvaColumns = computed(() => [
  { key: 'grant_number', label: t('grants.number'), sortable: true },
  { key: 'budget_display', label: t('finance.budget'), numeric: true },
  { key: 'disbursed_display', label: t('finance.disbursed'), numeric: true },
  { key: 'expense_display', label: t('finance.expenseTotal'), numeric: true },
]);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [c, e, g, b] = await Promise.all([
      api<Coa[]>('/v1/grant/coa'),
      api<Expense[]>('/v1/grant/expenses'),
      api<Grant[]>('/v1/grant/grants'),
      api<Bva>('/v1/grant/reports/budget-vs-actual'),
    ]);
    coa.value = c;
    expenses.value = e;
    grants.value = g;
    bva.value = b;
    if (!expenseForm.value.account_id && c[0]) expenseForm.value.account_id = c[0].id;
    if (!expenseForm.value.grant_id && g[0]) expenseForm.value.grant_id = g[0].id;
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('finance.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function createCoa() {
  busy.value = true;
  error.value = null;
  try {
    await api('/v1/grant/coa', {
      method: 'POST',
      body: JSON.stringify(coaForm.value),
    });
    coaForm.value = { account_code: '', name: '', account_type: 'expense' };
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('finance.saveFailed');
  } finally {
    busy.value = false;
  }
}

async function createExpense() {
  busy.value = true;
  error.value = null;
  try {
    await api('/v1/grant/expenses', {
      method: 'POST',
      body: JSON.stringify({
        ...expenseForm.value,
        grant_id: expenseForm.value.grant_id || null,
      }),
    });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('finance.saveFailed');
  } finally {
    busy.value = false;
  }
}

async function submitExpense(id: string) {
  busy.value = true;
  try {
    await api(`/v1/grant/expenses/${id}/submit`, { method: 'POST' });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('finance.saveFailed');
  } finally {
    busy.value = false;
  }
}

async function approveExpense(id: string) {
  busy.value = true;
  try {
    await api(`/v1/grant/expenses/${id}/approve`, { method: 'POST' });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('finance.saveFailed');
  } finally {
    busy.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section>
    <PageHeader
      :eyebrow="t('finance.eyebrow')"
      :title="t('finance.title')"
      :lede="t('finance.lede')"
    >
      <template #actions>
        <BaseButton variant="ghost" :disabled="loading" @click="load">{{ t('app.refresh') }}</BaseButton>
      </template>
    </PageHeader>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <SkeletonBlock v-if="loading" :rows="6" height="1.2rem" />

    <template v-else>
      <SectionCard :title="t('finance.coa')" title-id="coa-heading" class="block">
        <form class="create" @submit.prevent="createCoa">
          <BaseInput v-model="coaForm.account_code" :label="t('finance.accountCode')" required />
          <BaseInput v-model="coaForm.name" :label="t('finance.accountName')" required />
          <label class="field">
            <span>{{ t('finance.accountType') }}</span>
            <select v-model="coaForm.account_type">
              <option value="asset">asset</option>
              <option value="liability">liability</option>
              <option value="equity">equity</option>
              <option value="revenue">revenue</option>
              <option value="expense">expense</option>
            </select>
          </label>
          <BaseButton type="submit" :disabled="busy">{{ t('finance.addAccount') }}</BaseButton>
        </form>
        <DataTable
          :columns="coaColumns"
          :rows="coa"
          :caption="t('finance.coa')"
          :empty-title="t('finance.emptyCoa')"
          row-key="id"
        />
      </SectionCard>

      <SectionCard :title="t('finance.expenses')" title-id="exp-heading" class="block">
        <form class="create wide" @submit.prevent="createExpense">
          <label class="field">
            <span>{{ t('app.grants') }}</span>
            <select v-model="expenseForm.grant_id">
              <option value="">—</option>
              <option v-for="g in grants" :key="g.id" :value="g.id">
                {{ g.grant_number }} — {{ g.title }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('finance.account') }}</span>
            <select v-model="expenseForm.account_id" required>
              <option v-for="a in coa" :key="a.id" :value="a.id">
                {{ a.account_code }} — {{ a.name }}
              </option>
            </select>
          </label>
          <BaseInput v-model="expenseForm.expense_number" :label="t('finance.expenseNumber')" required />
          <BaseInput v-model="expenseForm.description" :label="t('finance.description')" required />
          <BaseInput v-model="expenseForm.amount" :label="t('grants.budget')" required />
          <BaseInput v-model="expenseForm.currency" :label="t('grants.currency')" required />
          <BaseInput
            v-model="expenseForm.expense_date"
            type="date"
            :label="t('finance.expenseDate')"
            required
          />
          <BaseButton type="submit" :disabled="busy">{{ t('finance.addExpense') }}</BaseButton>
        </form>
        <DataTable
          :columns="expenseColumns"
          :rows="expenseRows"
          :caption="t('finance.expenses')"
          :empty-title="t('finance.emptyExpenses')"
          row-key="id"
        >
          <template #cell-status="{ row }">
            <StatusBadge :status="String(row.status)" />
          </template>
          <template #cell-actions="{ row }">
            <BaseButton
              v-if="row.status === 'draft'"
              variant="ghost"
              :disabled="busy"
              @click="submitExpense(String(row.id))"
            >
              {{ t('workforce.submit') }}
            </BaseButton>
            <BaseButton
              v-else-if="row.status === 'submitted'"
              variant="ghost"
              :disabled="busy"
              @click="approveExpense(String(row.id))"
            >
              {{ t('workforce.approve') }}
            </BaseButton>
          </template>
        </DataTable>
      </SectionCard>

      <SectionCard :title="t('finance.bva')" title-id="bva-heading" class="block">
        <p v-if="bva?.fx_stale" class="warn" role="status">{{ t('finance.fxStale') }}</p>
        <DataTable
          :columns="bvaColumns"
          :rows="bvaRows"
          :caption="t('finance.bva')"
          :empty-title="t('finance.emptyBva')"
          row-key="grant_number"
        />
      </SectionCard>
    </template>
  </section>
</template>

<style scoped>
.block {
  margin-block-end: 1.25rem;
}
.create {
  display: grid;
  gap: 0.75rem;
  max-width: 28rem;
  margin-block-end: 1rem;
}
.create.wide {
  max-width: none;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.field select {
  padding: 0.55rem 0.65rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}
.error {
  color: var(--danger);
}
.warn {
  color: var(--warning);
  margin: 0 0 0.75rem;
}
@media (max-width: 900px) {
  .create.wide {
    grid-template-columns: 1fr;
  }
}
</style>
