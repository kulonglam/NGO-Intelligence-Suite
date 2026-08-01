<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '../components/base/BaseButton.vue';
import BaseInput from '../components/base/BaseInput.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';
import { api } from '../lib/api';

const { t } = useI18n();

type Sub = {
  id: string;
  endpoint_url: string;
  event_types: string[];
  status: string;
  secret?: string;
};

type Delivery = {
  id: string;
  event_type: string;
  status: string;
  http_status: number | null;
  attempt: number;
  created_at: string;
};

const rows = ref<Sub[]>([]);
const deliveries = ref<Delivery[]>([]);
const selected = ref<string | null>(null);
const endpoint = ref('http://127.0.0.1:9099/hook');
const error = ref<string | null>(null);
const status = ref<string | null>(null);
const busy = ref(false);
const onceSecret = ref<string | null>(null);

async function load() {
  rows.value = await api<Sub[]>('/v1/tenant/webhooks');
}

async function create() {
  busy.value = true;
  error.value = null;
  onceSecret.value = null;
  try {
    const r = await api<Sub>('/v1/tenant/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        endpoint_url: endpoint.value,
        event_types: ['*', 'webhook.test', 'grant.updated'],
      }),
    });
    onceSecret.value = r.secret ?? null;
    status.value = t('webhooks.created');
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('webhooks.failed');
  } finally {
    busy.value = false;
  }
}

async function disable(id: string) {
  busy.value = true;
  try {
    await api(`/v1/tenant/webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'disabled' }),
    });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('webhooks.failed');
  } finally {
    busy.value = false;
  }
}

async function sendTest(id: string) {
  busy.value = true;
  error.value = null;
  try {
    const r = await api<{ success: boolean; http_status: number }>(
      `/v1/tenant/webhooks/${id}/test`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    status.value = t('webhooks.testResult', {
      ok: r.success ? 'ok' : 'fail',
      code: r.http_status,
    });
    selected.value = id;
    deliveries.value = await api<Delivery[]>(`/v1/tenant/webhooks/${id}/deliveries`);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('webhooks.failed');
  } finally {
    busy.value = false;
  }
}

async function showDeliveries(id: string) {
  selected.value = id;
  deliveries.value = await api<Delivery[]>(`/v1/tenant/webhooks/${id}/deliveries`);
}

onMounted(() => {
  void load().catch((err) => {
    error.value = err instanceof Error ? err.message : t('webhooks.failed');
  });
});
</script>

<template>
  <section class="page">
    <PageHeader
      :eyebrow="t('webhooks.eyebrow')"
      :title="t('webhooks.title')"
      :lede="t('webhooks.lede')"
    />
    <AlertBanner v-if="error" variant="danger">{{ error }}</AlertBanner>
    <p v-if="status" class="ok">{{ status }}</p>
    <p v-if="onceSecret" class="secret">{{ t('webhooks.secretOnce', { s: onceSecret }) }}</p>

    <form class="create" @submit.prevent="create">
      <BaseInput v-model="endpoint" type="url" :label="t('webhooks.endpoint')" required ltr />
      <BaseButton type="submit" :disabled="busy">{{ t('webhooks.create') }}</BaseButton>
    </form>

    <ul class="list">
      <li v-for="r in rows" :key="r.id">
        <div>
          <strong>{{ r.status }}</strong>
          <span>{{ r.endpoint_url }}</span>
        </div>
        <div class="actions">
          <BaseButton variant="ghost" :disabled="busy" @click="showDeliveries(r.id)">
            {{ t('webhooks.history') }}
          </BaseButton>
          <BaseButton variant="ghost" :disabled="busy || r.status !== 'active'" @click="sendTest(r.id)">
            {{ t('webhooks.test') }}
          </BaseButton>
          <BaseButton variant="ghost" :disabled="busy || r.status === 'disabled'" @click="disable(r.id)">
            {{ t('webhooks.disable') }}
          </BaseButton>
        </div>
      </li>
    </ul>

    <div v-if="selected" class="deliveries">
      <h2>{{ t('webhooks.deliveries') }}</h2>
      <ul>
        <li v-for="d in deliveries" :key="d.id">
          {{ d.event_type }} · {{ d.status }} · HTTP {{ d.http_status ?? '—' }} · #{{ d.attempt }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.page {
  max-width: 42rem;
}
.ok,
.secret {
  color: var(--color-ok, #2a6);
  word-break: break-all;
}
.create {
  display: grid;
  gap: 0.75rem;
  margin: 1.25rem 0;
}
.create input {
  display: block;
  width: 100%;
  margin-top: 0.35rem;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.list li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
}
.list span {
  display: block;
  font-size: 0.85rem;
  opacity: 0.8;
  word-break: break-all;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.deliveries {
  margin-top: 1.5rem;
}
.deliveries ul {
  padding-left: 1.1rem;
}
</style>
