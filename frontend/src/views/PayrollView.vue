<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import BaseButton from '../components/base/BaseButton.vue';
import StatusBadge from '../components/base/StatusBadge.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import DataTable from '../components/data/DataTable.vue';
import DataTableToolbar from '../components/data/DataTableToolbar.vue';
import ConfirmDialog from '../components/feedback/ConfirmDialog.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';
import PayrollRunSummary from '../components/domain/PayrollRunSummary.vue';

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
const toast = useToastStore();
const runs = ref<PayrollRun[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
const busy = ref(false);
const approveId = ref<string | null>(null);
const filterQuery = ref('');

const columns = computed(() => [
  { key: 'period', label: t('workforce.period'), sortable: true },
  { key: 'status', label: t('grants.status') },
  { key: 'gross_display', label: t('workforce.gross'), numeric: true },
  { key: 'net_display', label: t('workforce.net'), numeric: true },
  { key: 'actions', label: '' },
]);

const rows = computed(() =>
  runs.value.map((r) => ({
    ...r,
    period: `${r.period_year}-${String(r.period_month).padStart(2, '0')}`,
    gross_display: formatMoney(r.total_gross, 'SSP', locale.value),
    net_display: formatMoney(r.total_net, 'SSP', locale.value),
  })),
);

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

async function confirmApprove() {
  if (!approveId.value) return;
  const runId = approveId.value;
  approveId.value = null;
  busy.value = true;
  try {
    await api(`/v1/hr/payroll-runs/${runId}/approve`, { method: 'POST' });
    toast.success(t('workforce.approvedToast'));
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

async function exportPayslips(run: Record<string, unknown>) {
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
    <PageHeader
      :eyebrow="t('workforce.eyebrow')"
      :title="t('workforce.payroll')"
      :lede="t('workforce.payrollLede')"
    >
      <template #actions>
        <BaseButton :disabled="busy" @click="createRun">{{ t('workforce.createRun') }}</BaseButton>
        <BaseButton variant="ghost" :disabled="busy" @click="refreshFx">{{
          t('workforce.refreshFx')
        }}</BaseButton>
        <BaseButton variant="ghost" :disabled="loading" @click="load">{{
          t('app.refresh')
        }}</BaseButton>
      </template>
    </PageHeader>
    <AlertBanner v-if="error" variant="danger">{{ error }}</AlertBanner>

    <PayrollRunSummary
      v-if="rows[0]"
      class="latest"
      :period="String(rows[0].period)"
      :status="String(rows[0].status)"
      :gross="String(rows[0].gross_display)"
      :net="String(rows[0].net_display)"
      :gross-label="t('workforce.gross')"
      :net-label="t('workforce.net')"
    />

    <DataTableToolbar v-model="filterQuery" />
    <DataTable
      :columns="columns"
      :rows="rows"
      :caption="t('workforce.payroll')"
      :loading="loading"
      :empty-title="t('workforce.noRuns')"
      :empty-body="t('workforce.noRunsBody')"
      :filter-query="filterQuery"
      row-key="id"
    >
      <template #empty>
        <BaseButton :disabled="busy" @click="createRun">{{ t('workforce.createRun') }}</BaseButton>
      </template>
      <template #cell-status="{ row }">
        <StatusBadge :status="String(row.status)" />
      </template>
      <template #cell-actions="{ row }">
        <div class="actions">
          <BaseButton
            v-if="row.status === 'draft' || row.status === 'failed'"
            variant="ghost"
            :disabled="busy"
            @click="calculate(String(row.id))"
          >
            {{ t('workforce.calculate') }}
          </BaseButton>
          <BaseButton
            v-if="row.status === 'computed'"
            variant="ghost"
            :disabled="busy"
            @click="submitRun(String(row.id))"
          >
            {{ t('workforce.submit') }}
          </BaseButton>
          <BaseButton
            v-if="row.status === 'pending_approval'"
            variant="ghost"
            :disabled="busy"
            @click="approveId = String(row.id)"
          >
            {{ t('workforce.approve') }}
          </BaseButton>
          <BaseButton
            v-if="canExport(String(row.status))"
            variant="ghost"
            :disabled="busy"
            @click="exportPayslips(row)"
          >
            {{ t('workforce.exportPayslips') }}
          </BaseButton>
        </div>
      </template>
    </DataTable>

    <ConfirmDialog
      :open="Boolean(approveId)"
      :title="t('workforce.approveConfirmTitle')"
      :body="t('workforce.approveConfirmBody')"
      :confirm-label="t('workforce.approveConfirm')"
      :cancel-label="t('confirm.cancel')"
      danger
      @cancel="approveId = null"
      @confirm="confirmApprove"
    />
  </section>
</template>

<style scoped>
.latest {
  margin-block-end: 1rem;
}
.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
</style>
