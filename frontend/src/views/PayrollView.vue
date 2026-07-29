<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import BaseButton from '../components/base/BaseButton.vue';
import StatusBadge from '../components/base/StatusBadge.vue';

type PayrollRun = {
  id: string;
  period_year: number;
  period_month: number;
  status: string;
  total_gross: string;
  total_net: string;
};

type PayslipJob = {
  job_id: string;
  status: string;
  artifacts: Array<{ id: string; format: string }>;
};

const { t, locale } = useI18n();
const auth = useAuthStore();
const runs = ref<PayrollRun[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
const busy = ref(false);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    runs.value = await api<PayrollRun[]>('/v1/hr/payroll-runs');
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function createRun() {
  busy.value = true;
  error.value = null;
  try {
    const now = new Date();
    await api('/v1/hr/payroll-runs', {
      method: 'POST',
      body: JSON.stringify({ period_year: now.getFullYear(), period_month: now.getMonth() + 1 }),
    });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.runFailed');
  } finally {
    busy.value = false;
  }
}

async function calculate(runId: string) {
  busy.value = true;
  try {
    await api(`/v1/hr/payroll-runs/${runId}/calculate`, { method: 'POST' });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.runFailed');
  } finally {
    busy.value = false;
  }
}

async function submitRun(runId: string) {
  busy.value = true;
  try {
    await api(`/v1/hr/payroll-runs/${runId}/submit`, { method: 'POST' });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.runFailed');
  } finally {
    busy.value = false;
  }
}

async function approveRun(runId: string) {
  busy.value = true;
  try {
    await api(`/v1/hr/payroll-runs/${runId}/approve`, { method: 'POST' });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.runFailed');
  } finally {
    busy.value = false;
  }
}

async function refreshFx() {
  busy.value = true;
  error.value = null;
  try {
    await api('/v1/hr/fx-rates/refresh', {
      method: 'POST',
      body: JSON.stringify({
        rates: [
          { base_currency: 'USD', quote_currency: 'SSP', rate: '6000.00000000' },
          { base_currency: 'USD', quote_currency: 'UGX', rate: '3800.00000000' },
        ],
      }),
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.fxFailed');
  } finally {
    busy.value = false;
  }
}

async function exportPayslips(run: PayrollRun) {
  busy.value = true;
  error.value = null;
  try {
    const job = await api<PayslipJob>('/v1/reporting/payslips', {
      method: 'POST',
      body: JSON.stringify({ payroll_run_id: run.id, formats: ['csv'] }),
    });
    const csvArtifact = job.artifacts.find((a) => a.format === 'csv');
    if (!csvArtifact) throw new Error(t('workforce.exportFailed'));
    const headers: HeadersInit = { Accept: '*/*' };
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
    const res = await fetch(
      `/v1/reporting/jobs/${job.job_id}/artifacts/${csvArtifact.id}/download`,
      { headers },
    );
    if (!res.ok) throw new Error(t('workforce.exportFailed'));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payslips-${run.period_year}-${String(run.period_month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('workforce.exportFailed');
  } finally {
    busy.value = false;
  }
}

function canExport(status: string): boolean {
  return ['computed', 'pending_approval', 'approved'].includes(status);
}

onMounted(() => void load());
</script>

<template>
  <section>
    <header>
      <p class="eyebrow">{{ t('workforce.eyebrow') }}</p>
      <h1>{{ t('workforce.payroll') }}</h1>
      <p class="lede">{{ t('workforce.payrollLede') }}</p>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="actions">
      <BaseButton :disabled="busy" @click="createRun">{{ t('workforce.createRun') }}</BaseButton>
      <BaseButton variant="ghost" :disabled="busy" @click="refreshFx">{{ t('workforce.refreshFx') }}</BaseButton>
      <BaseButton variant="ghost" :disabled="loading" @click="load">{{ t('app.refresh') }}</BaseButton>
    </div>
    <p v-if="loading">{{ t('app.loading') }}</p>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t('workforce.period') }}</th>
          <th>{{ t('grants.status') }}</th>
          <th>{{ t('workforce.gross') }}</th>
          <th>{{ t('workforce.net') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in runs" :key="r.id">
          <td>{{ r.period_year }}-{{ String(r.period_month).padStart(2, '0') }}</td>
          <td><StatusBadge :status="r.status" /></td>
          <td>{{ formatMoney(r.total_gross, 'SSP', locale) }}</td>
          <td>{{ formatMoney(r.total_net, 'SSP', locale) }}</td>
          <td>
            <BaseButton
              v-if="r.status === 'draft' || r.status === 'failed'"
              variant="ghost"
              :disabled="busy"
              @click="calculate(r.id)"
            >
              {{ t('workforce.calculate') }}
            </BaseButton>
            <BaseButton
              v-if="r.status === 'computed'"
              variant="ghost"
              :disabled="busy"
              @click="submitRun(r.id)"
            >
              {{ t('workforce.submit') }}
            </BaseButton>
            <BaseButton
              v-if="r.status === 'pending_approval'"
              variant="ghost"
              :disabled="busy"
              @click="approveRun(r.id)"
            >
              {{ t('workforce.approve') }}
            </BaseButton>
            <BaseButton
              v-if="canExport(r.status)"
              variant="ghost"
              :disabled="busy"
              @click="exportPayslips(r)"
            >
              {{ t('workforce.exportPayslips') }}
            </BaseButton>
          </td>
        </tr>
        <tr v-if="!runs.length">
          <td colspan="5">{{ t('workforce.noRuns') }}</td>
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
.actions {
  display: flex;
  gap: 0.75rem;
  margin: 1rem 0;
}
table {
  width: 100%;
  border-collapse: collapse;
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
