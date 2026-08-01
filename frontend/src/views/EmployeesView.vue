<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import BaseButton from '../components/base/BaseButton.vue';
import BaseInput from '../components/base/BaseInput.vue';
import StatusBadge from '../components/base/StatusBadge.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import SkeletonBlock from '../components/feedback/SkeletonBlock.vue';
import EmptyState from '../components/feedback/EmptyState.vue';

type Employee = {
  id: string;
  employee_number: string;
  display_name: string;
  payroll_country: string;
  status: string;
  hire_date: string;
  department_name: string;
  department_id: string;
};

type Department = { id: string; code: string; name: string };

const { t } = useI18n();
const employees = ref<Employee[]>([]);
const departments = ref<Department[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
const busy = ref(false);
const showForm = ref(false);

const form = ref({
  employee_number: '',
  first_name: '',
  last_name: '',
  payroll_country: 'SS' as 'SS' | 'UG',
  department_id: '',
  hire_date: new Date().toISOString().slice(0, 10),
  gross_salary: '40000.00',
  salary_currency: 'SSP',
  contract_number: '',
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [emps, deps] = await Promise.all([
      api<Employee[]>('/v1/hr/employees'),
      api<Department[]>('/v1/hr/departments'),
    ]);
    employees.value = emps;
    departments.value = deps;
    if (!form.value.department_id && deps[0]) form.value.department_id = deps[0].id;
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function createEmployee() {
  busy.value = true;
  error.value = null;
  try {
    const emp = await api<Employee>('/v1/hr/employees', {
      method: 'POST',
      body: JSON.stringify({
        employee_number: form.value.employee_number,
        first_name: form.value.first_name,
        last_name: form.value.last_name,
        payroll_country: form.value.payroll_country,
        department_id: form.value.department_id,
        hire_date: form.value.hire_date,
      }),
    });
    const contractNumber =
      form.value.contract_number || `CON-${form.value.employee_number}`;
    await api('/v1/hr/contracts', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: emp.id,
        contract_number: contractNumber,
        start_date: form.value.hire_date,
        gross_salary: form.value.gross_salary,
        salary_currency: form.value.salary_currency,
        allowances: [],
        status: 'active',
      }),
    });
    showForm.value = false;
    form.value.employee_number = '';
    form.value.first_name = '';
    form.value.last_name = '';
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.createFailed');
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
      :title="t('workforce.employees')"
      :lede="t('workforce.employeesLede')"
    >
      <template #actions>
        <BaseButton :disabled="busy" @click="showForm = !showForm">
          {{ showForm ? t('app.back') : t('workforce.addEmployee') }}
        </BaseButton>
        <BaseButton variant="ghost" :disabled="loading" @click="load">{{ t('app.refresh') }}</BaseButton>
      </template>
    </PageHeader>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <form v-if="showForm" class="create" @submit.prevent="createEmployee">
      <BaseInput v-model="form.employee_number" :label="t('workforce.number')" required />
      <BaseInput v-model="form.first_name" :label="t('workforce.firstName')" required />
      <BaseInput v-model="form.last_name" :label="t('workforce.lastName')" required />
      <label class="field">
        <span>{{ t('workforce.country') }}</span>
        <select v-model="form.payroll_country">
          <option value="SS">South Sudan</option>
          <option value="UG">Uganda</option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('workforce.department') }}</span>
        <select v-model="form.department_id" required>
          <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </label>
      <BaseInput v-model="form.hire_date" type="date" :label="t('workforce.hireDate')" required />
      <BaseInput v-model="form.gross_salary" :label="t('workforce.gross')" required />
      <BaseInput v-model="form.salary_currency" :label="t('workforce.currency')" required />
      <BaseButton type="submit" :disabled="busy">{{ t('workforce.saveEmployee') }}</BaseButton>
    </form>

    <SkeletonBlock v-if="loading" :rows="5" height="1.25rem" />
    <EmptyState v-else-if="!employees.length" :title="t('workforce.empty')" />
    <table v-else>
      <thead>
        <tr>
          <th>{{ t('workforce.number') }}</th>
          <th>{{ t('workforce.name') }}</th>
          <th>{{ t('workforce.country') }}</th>
          <th>{{ t('workforce.department') }}</th>
          <th>{{ t('grants.status') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in employees" :key="e.id">
          <td>{{ e.employee_number }}</td>
          <td>{{ e.display_name }}</td>
          <td>{{ e.payroll_country }}</td>
          <td>{{ e.department_name }}</td>
          <td><StatusBadge :status="e.status" /></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.create {
  display: grid;
  gap: 0.75rem;
  max-width: 28rem;
  margin-bottom: 1.5rem;
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
  margin: 1rem 0;
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
