<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import BaseButton from '../components/base/BaseButton.vue';
import StatusBadge from '../components/base/StatusBadge.vue';

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
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading">{{ t('app.loading') }}</p>

    <template v-if="summary && !loading">
      <div class="head">
        <div>
          <p class="eyebrow bidi-isolate" dir="ltr">{{ summary.grant.grant_number }}</p>
          <h1 id="grant-heading">{{ summary.grant.title }}</h1>
          <p class="meta">
            {{ summary.grant.donor_name }} ·
            <StatusBadge :status="summary.grant.status" />
          </p>
        </div>
        <BaseButton variant="ghost" @click="load">{{ t('app.refresh') }}</BaseButton>
      </div>

      <div class="stats">
        <div>
          <span>{{ t('grants.detail.ceiling') }}</span>
          <strong class="bidi-isolate" dir="ltr">
            {{ formatMoney(summary.ceiling, summary.currency, locale) }}
          </strong>
        </div>
        <div>
          <span>{{ t('grants.detail.committed') }}</span>
          <strong class="bidi-isolate" dir="ltr">
            {{ formatMoney(summary.committed, summary.currency, locale) }}
          </strong>
        </div>
        <div>
          <span>{{ t('grants.detail.remaining') }}</span>
          <strong class="bidi-isolate" dir="ltr">
            {{ formatMoney(summary.remaining, summary.currency, locale) }}
          </strong>
        </div>
      </div>

      <div class="panel">
        <h2>{{ t('grants.detail.disbursements') }}</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">{{ t('grants.detail.date') }}</th>
              <th scope="col">{{ t('grants.detail.amount') }}</th>
              <th scope="col">{{ t('grants.status') }}</th>
              <th scope="col">{{ t('grants.detail.submitForApproval') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in disbursements" :key="d.id">
              <td class="bidi-isolate" dir="ltr">
                {{ d.received_date?.slice?.(0, 10) ?? d.received_date }}
              </td>
              <td class="bidi-isolate" dir="ltr">
                {{ formatMoney(d.amount, d.currency, locale) }}
              </td>
              <td><StatusBadge :status="d.status" /></td>
              <td class="actions">
                <BaseButton
                  v-if="d.status === 'recorded'"
                  variant="ghost"
                  @click="submitDisbursement(d.id)"
                >
                  {{ t('grants.detail.submitForApproval') }}
                </BaseButton>
                <BaseButton
                  v-if="d.status === 'pending_approval' || d.status === 'recorded'"
                  variant="ghost"
                  @click="approveDisbursement(d.id)"
                >
                  {{ t('grants.detail.approve') }}
                </BaseButton>
              </td>
            </tr>
            <tr v-if="disbursements.length === 0">
              <td colspan="4">{{ t('grants.detail.emptyDisbursements') }}</td>
            </tr>
          </tbody>
        </table>

        <form class="create" @submit.prevent="createDisbursement">
          <h3>{{ t('grants.detail.record') }}</h3>
          <div class="row">
            <label>
              {{ t('grants.detail.amount') }}
              <input v-model="form.amount" required dir="ltr" />
            </label>
            <label>
              {{ t('grants.currency') }}
              <input v-model="form.currency" maxlength="3" required dir="ltr" />
            </label>
            <label>
              {{ t('grants.detail.date') }}
              <input v-model="form.received_date" type="date" required dir="ltr" />
            </label>
          </div>
          <label>
            {{ t('grants.detail.notes') }}
            <input v-model="form.notes" />
          </label>
          <BaseButton type="submit" variant="secondary">{{ t('grants.detail.record') }}</BaseButton>
        </form>
      </div>

      <div class="panel">
        <h2>{{ t('grants.detail.files') }}</h2>
        <ul class="files">
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
          <li v-if="files.length === 0">{{ t('grants.detail.emptyFiles') }}</li>
        </ul>
        <label class="upload">
          {{ t('grants.detail.upload') }}
          <input ref="fileInput" type="file" @change="uploadFile" />
        </label>
      </div>
    </template>
  </section>
</template>

<style scoped>
.back { margin: 0 0 12px; }
.back a { color: var(--brand); text-decoration: none; font-weight: 600; }
.head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  margin-bottom: 18px;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
  color: var(--brand);
  font-weight: 600;
  margin: 0;
}
h1 { margin: 6px 0 0; color: var(--brand-deep); }
.meta { color: var(--ink-muted); margin: 6px 0 0; }
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.stats div {
  background: rgba(255,255,255,0.84);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 16px;
  display: grid;
  gap: 6px;
}
.stats span { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); }
.stats strong { font-size: 1.15rem; color: var(--brand-deep); }
.panel {
  background: rgba(255,255,255,0.84);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 18px;
  margin-bottom: 18px;
}
table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
th, td { text-align: start; padding: 10px 8px; border-bottom: 1px solid var(--line); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.create { display: grid; gap: 10px; margin-top: 16px; }
.row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
label { display: grid; gap: 6px; font-size: 0.9rem; font-weight: 500; }
input {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
}
.files { list-style: none; padding: 0; margin: 0 0 12px; display: grid; gap: 8px; }
.files li { display: flex; justify-content: space-between; gap: 12px; }
.linkish {
  border: 0;
  background: none;
  color: var(--brand);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-align: start;
}
.linkish:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
.upload { display: grid; gap: 8px; font-weight: 500; }
.error { color: var(--danger); }
@media (max-width: 900px) {
  .stats, .row { grid-template-columns: 1fr; }
}
</style>
