<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import BaseButton from '../components/base/BaseButton.vue';
import BaseDatePicker from '../components/base/BaseDatePicker.vue';
import BaseTextarea from '../components/base/BaseTextarea.vue';
import StatusBadge from '../components/base/StatusBadge.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import SectionCard from '../components/layout/SectionCard.vue';
import StatCard from '../components/data/StatCard.vue';
import DataTable from '../components/data/DataTable.vue';
import SkeletonBlock from '../components/feedback/SkeletonBlock.vue';
import EmptyState from '../components/feedback/EmptyState.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';
import CurrencyInput from '../components/forms/CurrencyInput.vue';
import GrantStatusBadge from '../components/domain/GrantStatusBadge.vue';
import BurnRateChart from '../components/domain/BurnRateChart.vue';
import AuditTrailList from '../components/domain/AuditTrailList.vue';

type Summary = {
  grant: {
    id: string;
    grant_number: string;
    title: string;
    donor_name: string;
    currency: string;
    total_budget: string;
    status: string;
  };
  ceiling: string;
  currency: string;
  committed: string;
  remaining: string;
  budgets: Array<{ id: string; version_number: number; total_budgeted: string; is_current: boolean }>;
};

type Disbursement = {
  id: string;
  amount: string;
  currency: string;
  received_date: string;
  status: string;
  created_by: string | null;
  approved_by: string | null;
  notes: string | null;
};

type FileObject = {
  id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  purpose: string;
  created_at: string;
};

const { t, locale } = useI18n();
const route = useRoute();
const auth = useAuthStore();
const grantId = computed(() => String(route.params.id));

const summary = ref<Summary | null>(null);
const disbursements = ref<Disbursement[]>([]);
const files = ref<FileObject[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
const form = ref({
  amount: '10000.00',
  currency: 'USD',
  received_date: new Date().toISOString().slice(0, 10),
  payment_method: 'bank_transfer',
  notes: '',
});
const fileInput = ref<HTMLInputElement | null>(null);

const disbursementColumns = computed(() => [
  { key: 'date_display', label: t('grants.detail.date'), sortable: true },
  { key: 'amount_display', label: t('grants.detail.amount'), numeric: true },
  { key: 'status', label: t('grants.status') },
  { key: 'actions', label: '' },
]);

const disbursementRows = computed(() =>
  disbursements.value.map((d) => ({
    ...d,
    date_display: d.received_date?.slice?.(0, 10) ?? d.received_date,
    amount_display: formatMoney(d.amount, d.currency, locale.value),
  })),
);

const auditItems = computed(() =>
  disbursements.value.map((d) => ({
    id: d.id,
    title: d.status,
    at: d.received_date,
    body: formatMoney(d.amount, d.currency, locale.value),
  })),
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const id = grantId.value;
    summary.value = await api<Summary>(`/v1/grant/grants/${id}/summary`);
    disbursements.value = await api<Disbursement[]>(`/v1/grant/grants/${id}/disbursements`);
    files.value = await api<FileObject[]>(
      `/v1/file/objects?owner_resource_type=grant&owner_resource_id=${encodeURIComponent(id)}`,
    );
    if (summary.value) form.value.currency = summary.value.currency;
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('grants.detail.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function createDisbursement() {
  error.value = null;
  try {
    await api(`/v1/grant/grants/${grantId.value}/disbursements`, {
      method: 'POST',
      body: JSON.stringify(form.value),
    });
    form.value.notes = '';
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Create failed';
  }
}

async function submitDisbursement(id: string) {
  error.value = null;
  try {
    await api(`/v1/grant/grants/${grantId.value}/disbursements/${id}/submit`, { method: 'POST' });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Submit failed';
  }
}

async function approveDisbursement(id: string) {
  error.value = null;
  try {
    await api(`/v1/grant/grants/${grantId.value}/disbursements/${id}/approve`, { method: 'POST' });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Approve failed';
  }
}

async function uploadFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  error.value = null;
  try {
    const body = new FormData();
    body.append('file', file);
    body.append('purpose', 'grant_document');
    body.append('owner_resource_type', 'grant');
    body.append('owner_resource_id', grantId.value);
    const headers: HeadersInit = { Accept: 'application/json' };
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
    const res = await fetch('/v1/file/objects', { method: 'POST', headers, body });
    const json = (await res.json()) as { success: boolean; errors?: Array<{ message: string }> };
    if (!res.ok || !json.success) {
      throw new Error(json.errors?.[0]?.message ?? `Upload failed (${res.status})`);
    }
    input.value = '';
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Upload failed';
  }
}

async function downloadFile(id: string, name: string) {
  error.value = null;
  try {
    const headers: HeadersInit = { Accept: '*/*' };
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
    const res = await fetch(`/v1/file/objects/${id}/content`, { headers });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Download failed';
  }
}

onMounted(() => {
  void load();
});
watch(grantId, () => {
  void load();
});
</script>

<template>
  <section aria-labelledby="grant-heading">
    <p class="back">
      <RouterLink to="/grants">← {{ t('grants.detail.awards') }}</RouterLink>
    </p>
    <AlertBanner v-if="error" variant="danger">{{ error }}</AlertBanner>
    <SkeletonBlock v-if="loading" :rows="5" height="1.25rem" />

    <template v-if="summary && !loading">
      <PageHeader
        :eyebrow="summary.grant.grant_number"
        :title="summary.grant.title"
        :lede="`${summary.grant.donor_name}`"
        heading-id="grant-heading"
      >
        <template #actions>
          <GrantStatusBadge :status="summary.grant.status" />
          <BaseButton variant="ghost" @click="load">{{ t('app.refresh') }}</BaseButton>
        </template>
      </PageHeader>

      <div class="stats">
        <StatCard
          :label="t('grants.detail.ceiling')"
          :value="formatMoney(summary.ceiling, summary.currency, locale)"
        />
        <StatCard
          :label="t('grants.detail.committed')"
          :value="formatMoney(summary.committed, summary.currency, locale)"
        />
        <StatCard
          :label="t('grants.detail.remaining')"
          :value="formatMoney(summary.remaining, summary.currency, locale)"
        />
      </div>

      <BurnRateChart
        class="burn"
        :categories="[summary.grant.grant_number]"
        :budget="[Number(summary.ceiling)]"
        :spent="[Number(summary.committed)]"
      />

      <AuditTrailList
        v-if="auditItems.length"
        class="audit"
        :items="auditItems"
        :title="t('grants.detail.disbursements')"
      />

      <SectionCard :title="t('grants.detail.disbursements')" title-id="disb-heading">
        <DataTable
          :columns="disbursementColumns"
          :rows="disbursementRows"
          :caption="t('grants.detail.disbursements')"
          :empty-title="t('grants.detail.emptyDisbursements')"
          :paginate="false"
          row-key="id"
        >
          <template #cell-status="{ row }">
            <StatusBadge :status="String(row.status)" />
          </template>
          <template #cell-actions="{ row }">
            <div class="actions">
              <BaseButton
                v-if="row.status === 'recorded'"
                variant="ghost"
                @click="submitDisbursement(String(row.id))"
              >
                {{ t('grants.detail.submitForApproval') }}
              </BaseButton>
              <BaseButton
                v-if="row.status === 'pending_approval' || row.status === 'recorded'"
                variant="ghost"
                @click="approveDisbursement(String(row.id))"
              >
                {{ t('grants.detail.approve') }}
              </BaseButton>
            </div>
          </template>
        </DataTable>

        <form class="create" @submit.prevent="createDisbursement">
          <h3>{{ t('grants.detail.record') }}</h3>
          <div class="row">
            <CurrencyInput
              v-model="form.amount"
              v-model:currency="form.currency"
              :label="t('grants.detail.amount')"
              required
            />
            <BaseDatePicker
              v-model="form.received_date"
              :label="t('grants.detail.date')"
              required
            />
          </div>
          <BaseTextarea v-model="form.notes" :label="t('grants.detail.notes')" :rows="2" />
          <BaseButton type="submit" variant="secondary">{{ t('grants.detail.record') }}</BaseButton>
        </form>
      </SectionCard>

      <SectionCard :title="t('grants.detail.files')" title-id="files-heading">
        <EmptyState v-if="!files.length" :title="t('grants.detail.emptyFiles')" />
        <ul v-else class="files">
          <li v-for="f in files" :key="f.id">
            <button
              type="button"
              class="linkish"
              @click="downloadFile(f.id, f.original_filename)"
            >
              {{ f.original_filename }}
            </button>
            <span class="bidi-isolate" dir="ltr">{{ Math.round(f.size_bytes / 1024) }} KB</span>
          </li>
        </ul>
        <label class="upload">
          {{ t('grants.detail.upload') }}
          <input ref="fileInput" type="file" @change="uploadFile" />
        </label>
      </SectionCard>
    </template>
  </section>
</template>

<style scoped>
.back { margin: 0 0 12px; }
.back a { color: var(--color-primary); text-decoration: none; font-weight: 600; }
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.burn,
.audit {
  margin-bottom: 20px;
}
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.create { display: grid; gap: 10px; margin-top: 16px; }
.row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.files { list-style: none; padding: 0; margin: 0 0 12px; display: grid; gap: 8px; }
.files li { display: flex; justify-content: space-between; gap: 12px; }
.linkish {
  border: 0;
  background: none;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-align: start;
}
.linkish:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.upload { display: grid; gap: 8px; font-weight: 500; }
@media (max-width: 900px) {
  .stats, .row { grid-template-columns: 1fr; }
}
</style>
