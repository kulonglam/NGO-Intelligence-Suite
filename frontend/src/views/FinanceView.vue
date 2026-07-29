<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import BaseButton from '../components/base/BaseButton.vue';
import BaseInput from '../components/base/BaseInput.vue';
import StatusBadge from '../components/base/StatusBadge.vue';

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
    <header>
      <p class="eyebrow">{{ t('finance.eyebrow') }}</p>
      <h1>{{ t('finance.title') }}</h1>
      <p class="lede">{{ t('finance.lede') }}</p>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading">{{ t('app.loading') }}</p>

    <template v-else>
      <h2>{{ t('finance.coa') }}</h2>
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
      <table>
        <thead>
          <tr>
            <th>{{ t('finance.accountCode') }}</th>
            <th>{{ t('finance.accountName') }}</th>
            <th>{{ t('finance.accountType') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in coa" :key="a.id">
            <td>{{ a.account_code }}</td>
            <td>{{ a.name }}</td>
            <td>{{ a.account_type }}</td>
          </tr>
          <tr v-if="!coa.length">
            <td colspan="3">{{ t('finance.emptyCoa') }}</td>
          </tr>
        </tbody>
      </table>

      <h2>{{ t('finance.expenses') }}</h2>
      <form class="create" @submit.prevent="createExpense">
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
      <table>
        <thead>
          <tr>
            <th>{{ t('finance.expenseNumber') }}</th>
            <th>{{ t('finance.description') }}</th>
            <th>{{ t('grants.budget') }}</th>
            <th>{{ t('grants.status') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in expenses" :key="e.id">
            <td>{{ e.expense_number }}</td>
            <td>{{ e.description }}</td>
            <td>{{ formatMoney(e.amount, e.currency, locale) }}</td>
            <td><StatusBadge :status="e.status" /></td>
            <td>
              <BaseButton
                v-if="e.status === 'draft'"
                variant="ghost"
                :disabled="busy"
                @click="submitExpense(e.id)"
              >
                {{ t('workforce.submit') }}
              </BaseButton>
              <BaseButton
                v-else-if="e.status === 'submitted'"
                variant="ghost"
                :disabled="busy"
                @click="approveExpense(e.id)"
              >
                {{ t('workforce.approve') }}
              </BaseButton>
            </td>
          </tr>
          <tr v-if="!expenses.length">
            <td colspan="5">{{ t('finance.emptyExpenses') }}</td>
          </tr>
        </tbody>
      </table>

      <h2>{{ t('finance.bva') }}</h2>
      <p v-if="bva?.fx_stale" class="warn" role="status">{{ t('finance.fxStale') }}</p>
      <table>
        <thead>
          <tr>
            <th>{{ t('grants.number') }}</th>
            <th>{{ t('finance.budget') }}</th>
            <th>{{ t('finance.disbursed') }}</th>
            <th>{{ t('finance.expenseTotal') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in bva?.grants ?? []" :key="line.grant_number">
            <td>{{ line.grant_number }}</td>
            <td>{{ formatMoney(line.total_budget, line.currency || 'USD', locale) }}</td>
            <td>{{ formatMoney(line.disbursed, line.currency || 'USD', locale) }}</td>
            <td>{{ formatMoney(line.expenses_approved, line.currency || 'USD', locale) }}</td>
          </tr>
          <tr v-if="!(bva?.grants?.length)">
            <td colspan="4">{{ t('finance.emptyBva') }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>

<style scoped>
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.75rem;
  color: var(--muted);
}
.lede {
  color: var(--muted);
  max-width: 42rem;
}
.create {
  display: grid;
  gap: 0.75rem;
  max-width: 28rem;
  margin: 1rem 0 1.5rem;
  padding: 1rem;
  border: 1px solid var(--line, var(--border));
  border-radius: var(--radius-md, 10px);
  background: #ffffffd6;
}
.field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.field select {
  padding: 0.55rem 0.65rem;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--line, var(--border));
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 2rem;
}
th,
td {
  text-align: start;
  padding: 0.65rem 0.5rem;
  border-bottom: 1px solid var(--border);
}
.error {
  color: var(--danger);
}
.warn {
  color: var(--warning, #9a6700);
}
h2 {
  margin-top: 1.5rem;
  font-size: 1.15rem;
}
</style>
