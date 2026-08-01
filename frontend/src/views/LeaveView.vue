<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import BaseButton from '../components/base/BaseButton.vue';
import BaseDatePicker from '../components/base/BaseDatePicker.vue';
import BaseInput from '../components/base/BaseInput.vue';
import BaseSelect from '../components/base/BaseSelect.vue';
import StatusBadge from '../components/base/StatusBadge.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import SectionCard from '../components/layout/SectionCard.vue';
import DataTable from '../components/data/DataTable.vue';
import DataTableToolbar from '../components/data/DataTableToolbar.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';

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
const balanceFilter = ref('');
const requestFilter = ref('');
const form = ref({
  employee_id: '',
  leave_type_id: '',
  start_date: '',
  end_date: '',
  days_requested: '1',
});

const employeeOptions = computed(() =>
  employees.value.map((e) => ({
    value: e.id,
    label: `${e.employee_number} — ${e.display_name}`,
  })),
);

const leaveTypeOptions = computed(() =>
  types.value.map((lt) => ({ value: lt.id, label: lt.name })),
);

const balanceColumns = computed(() => [
  { key: 'display_name', label: t('workforce.name'), sortable: true },
  { key: 'leave_type_name', label: t('workforce.leaveType'), sortable: true },
  { key: 'accrued_days', label: t('workforce.accrued'), numeric: true },
  { key: 'taken_days', label: t('workforce.taken'), numeric: true },
]);

const balanceRows = computed(() =>
  balances.value.map((b, i) => ({
    ...b,
    id: `${b.employee_id}-${b.leave_type_code}-${i}`,
    leave_type_name: b.leave_type_name ?? b.leave_type_code,
  })),
);

const requestColumns = computed(() => [
  { key: 'display_name', label: t('workforce.name'), sortable: true },
  { key: 'leave_type_name', label: t('workforce.leaveType') },
  { key: 'period', label: t('workforce.period') },
  { key: 'days_requested', label: t('workforce.days'), numeric: true },
  { key: 'status', label: t('grants.status') },
  { key: 'actions', label: '' },
]);

const requestRows = computed(() =>
  requests.value.map((r) => ({
    ...r,
    period: `${r.start_date} → ${r.end_date}`,
  })),
);

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
    <PageHeader
      :eyebrow="t('workforce.eyebrow')"
      :title="t('workforce.leave')"
      :lede="t('workforce.leaveLede')"
    >
      <template #actions>
        <BaseButton variant="ghost" :disabled="loading" @click="load">{{ t('app.refresh') }}</BaseButton>
      </template>
    </PageHeader>
    <AlertBanner v-if="error" variant="danger">{{ error }}</AlertBanner>

    <SectionCard :title="t('workforce.balances')" title-id="balances-heading" class="block">
      <template #actions>
        <BaseButton :disabled="busy" @click="runAccrue">{{ t('workforce.accrue') }}</BaseButton>
      </template>
      <DataTableToolbar v-model="balanceFilter" />
      <DataTable
        :columns="balanceColumns"
        :rows="balanceRows"
        :caption="t('workforce.balances')"
        :loading="loading"
        :empty-title="t('workforce.noBalances')"
        :filter-query="balanceFilter"
        row-key="id"
      />
    </SectionCard>

    <form class="create" @submit.prevent="createRequest">
      <BaseSelect
        v-model="form.employee_id"
        :label="t('workforce.employees')"
        :options="employeeOptions"
        required
        ltr
      />
      <BaseSelect
        v-model="form.leave_type_id"
        :label="t('workforce.leaveType')"
        :options="leaveTypeOptions"
        required
      />
      <BaseDatePicker v-model="form.start_date" :label="t('workforce.startDate')" required />
      <BaseDatePicker v-model="form.end_date" :label="t('workforce.endDate')" required />
      <BaseInput
        v-model="form.days_requested"
        type="number"
        :label="t('workforce.days')"
        required
      />
      <BaseButton type="submit" :disabled="busy">{{ t('workforce.requestLeave') }}</BaseButton>
    </form>

    <DataTableToolbar v-model="requestFilter" />
    <DataTable
      :columns="requestColumns"
      :rows="requestRows"
      :caption="t('workforce.leave')"
      :loading="loading"
      :empty-title="t('workforce.noLeave')"
      :filter-query="requestFilter"
      row-key="id"
    >
      <template #cell-status="{ row }">
        <StatusBadge :status="String(row.status)" />
      </template>
      <template #cell-actions="{ row }">
        <BaseButton
          v-if="row.status === 'pending'"
          variant="ghost"
          :disabled="busy"
          @click="approve(String(row.id))"
        >
          {{ t('workforce.approve') }}
        </BaseButton>
      </template>
    </DataTable>
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
  margin: 1rem 0 1.5rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
</style>
