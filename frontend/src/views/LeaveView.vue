<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import BaseButton from '../components/base/BaseButton.vue';
import BaseInput from '../components/base/BaseInput.vue';
import StatusBadge from '../components/base/StatusBadge.vue';

type LeaveType = { id: string; code: string; name: string };
type Employee = { id: string; display_name: string; employee_number: string };
type LeaveRequest = {
  id: string;
  display_name: string;
  employee_number: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  days_requested: string;
  status: string;
};
type LeaveBalance = {
  employee_id: string;
  employee_number: string;
  display_name: string;
  leave_type_code: string;
  leave_type_name: string;
  accrued_days: string;
  taken_days: string;
  balance_days?: string;
};

const { t } = useI18n();
const types = ref<LeaveType[]>([]);
const employees = ref<Employee[]>([]);
const requests = ref<LeaveRequest[]>([]);
const balances = ref<LeaveBalance[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
const busy = ref(false);
const form = ref({
  employee_id: '',
  leave_type_id: '',
  start_date: '',
  end_date: '',
  days_requested: '1',
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [lt, emps, reqs, bals] = await Promise.all([
      api<LeaveType[]>('/v1/hr/leave-types'),
      api<Employee[]>('/v1/hr/employees'),
      api<LeaveRequest[]>('/v1/hr/leave-requests'),
      api<LeaveBalance[]>('/v1/hr/leave-balances'),
    ]);
    types.value = lt;
    employees.value = emps;
    requests.value = reqs;
    balances.value = bals;
    if (!form.value.employee_id && emps[0]) form.value.employee_id = emps[0].id;
    if (!form.value.leave_type_id && lt[0]) form.value.leave_type_id = lt[0].id;
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function createRequest() {
  busy.value = true;
  error.value = null;
  try {
    await api('/v1/hr/leave-requests', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: form.value.employee_id,
        leave_type_id: form.value.leave_type_id,
        start_date: form.value.start_date,
        end_date: form.value.end_date,
        days_requested: Number(form.value.days_requested),
      }),
    });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.leaveFailed');
  } finally {
    busy.value = false;
  }
}

async function approve(id: string) {
  busy.value = true;
  try {
    await api(`/v1/hr/leave-requests/${id}/approve`, { method: 'POST' });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.leaveFailed');
  } finally {
    busy.value = false;
  }
}

async function runAccrue() {
  busy.value = true;
  error.value = null;
  try {
    const now = new Date();
    await api('/v1/hr/leave/accrue', {
      method: 'POST',
      body: JSON.stringify({
        period_year: now.getFullYear(),
        period_month: now.getMonth() + 1,
      }),
    });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.accrueFailed');
  } finally {
    busy.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section>
    <header>
      <p class="eyebrow">{{ t('workforce.eyebrow') }}</p>
      <h1>{{ t('workforce.leave') }}</h1>
      <p class="lede">{{ t('workforce.leaveLede') }}</p>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div class="balances-head">
      <h2>{{ t('workforce.balances') }}</h2>
      <BaseButton :disabled="busy" @click="runAccrue">{{ t('workforce.accrue') }}</BaseButton>
    </div>
    <table>
      <thead>
        <tr>
          <th>{{ t('workforce.name') }}</th>
          <th>{{ t('workforce.leaveType') }}</th>
          <th>{{ t('workforce.accrued') }}</th>
          <th>{{ t('workforce.taken') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(b, i) in balances" :key="i">
          <td>{{ b.display_name }}</td>
          <td>{{ b.leave_type_name ?? b.leave_type_code }}</td>
          <td>{{ b.accrued_days }}</td>
          <td>{{ b.taken_days }}</td>
        </tr>
        <tr v-if="!balances.length && !loading">
          <td colspan="4">{{ t('workforce.noBalances') }}</td>
        </tr>
      </tbody>
    </table>

    <form class="create" @submit.prevent="createRequest">
      <label class="field">
        <span>{{ t('workforce.employees') }}</span>
        <select v-model="form.employee_id" required>
          <option v-for="e in employees" :key="e.id" :value="e.id">
            {{ e.employee_number }} — {{ e.display_name }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('workforce.leaveType') }}</span>
        <select v-model="form.leave_type_id" required>
          <option v-for="lt in types" :key="lt.id" :value="lt.id">{{ lt.name }}</option>
        </select>
      </label>
      <BaseInput v-model="form.start_date" type="date" :label="t('workforce.startDate')" required />
      <BaseInput v-model="form.end_date" type="date" :label="t('workforce.endDate')" required />
      <BaseInput
        v-model="form.days_requested"
        type="number"
        :label="t('workforce.days')"
        required
      />
      <BaseButton type="submit" :disabled="busy">{{ t('workforce.requestLeave') }}</BaseButton>
    </form>

    <p v-if="loading">{{ t('app.loading') }}</p>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t('workforce.name') }}</th>
          <th>{{ t('workforce.leaveType') }}</th>
          <th>{{ t('workforce.period') }}</th>
          <th>{{ t('workforce.days') }}</th>
          <th>{{ t('grants.status') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in requests" :key="r.id">
          <td>{{ r.display_name }}</td>
          <td>{{ r.leave_type_name }}</td>
          <td>{{ r.start_date }} → {{ r.end_date }}</td>
          <td>{{ r.days_requested }}</td>
          <td><StatusBadge :status="r.status" /></td>
          <td>
            <BaseButton
              v-if="r.status === 'pending'"
              variant="ghost"
              :disabled="busy"
              @click="approve(r.id)"
            >
              {{ t('workforce.approve') }}
            </BaseButton>
          </td>
        </tr>
        <tr v-if="!requests.length">
          <td colspan="6">{{ t('workforce.noLeave') }}</td>
        </tr>
      </tbody>
    </table>
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
.balances-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
}
.balances-head h2 {
  margin: 0;
  font-size: 1.15rem;
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
  margin-bottom: 1.25rem;
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
</style>
