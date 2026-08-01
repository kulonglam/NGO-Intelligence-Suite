<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '../components/base/BaseButton.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import { api } from '../lib/api';

const { t } = useI18n();
const score = ref<Record<string, unknown> | null>(null);
const pubs = ref<Array<Record<string, unknown>>>([]);
const error = ref<string | null>(null);
const status = ref<string | null>(null);
const busy = ref(false);

async function load() {
  score.value = await api('/v1/analytics/compliance-score');
  pubs.value = await api('/v1/integrations/iati/publications');
}

async function publishIati() {
  busy.value = true;
  error.value = null;
  try {
    const r = await api<{ id: string; exclusions_applied: string[] }>(
      '/v1/integrations/iati/publish',
      {
        method: 'POST',
        body: JSON.stringify({ include_pii_seed: true, use_koch_indicators: true }),
      },
    );
    status.value = t('compliance.published', { id: r.id });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('compliance.failed');
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void load().catch((err) => {
    error.value = err instanceof Error ? err.message : t('compliance.failed');
  });
});
</script>

<template>
  <section class="page">
    <PageHeader
      :eyebrow="t('compliance.eyebrow')"
      :title="t('compliance.title')"
      :lede="t('compliance.lede')"
    >
      <template #actions>
        <BaseButton :disabled="busy" @click="publishIati">{{ t('compliance.publishIati') }}</BaseButton>
      </template>
    </PageHeader>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="status" class="ok">{{ status }}</p>
    <p v-if="score" class="score">
      {{ t('compliance.score', { n: score.score }) }}
    </p>
    <ul class="list">
      <li v-for="p in pubs" :key="String(p.id)">
        <strong>{{ p.status }}</strong>
        <span>{{ p.checksum }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.page {
  max-width: 40rem;
}
.error {
  color: var(--color-danger, #a33);
}
.ok {
  color: var(--color-ok, #2a6);
}
.score {
  font-size: 1.25rem;
  font-weight: 600;
}
.list {
  list-style: none;
  padding: 0;
  margin-top: 1.5rem;
  display: grid;
  gap: 0.5rem;
}
.list li {
  display: grid;
  gap: 0.15rem;
  font-size: 0.85rem;
  word-break: break-all;
}
</style>
