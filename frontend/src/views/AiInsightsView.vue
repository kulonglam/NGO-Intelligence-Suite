<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '../components/base/BaseButton.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import { api } from '../lib/api';

type Insight = {
  id: string;
  approval_status: string;
  preview?: string;
  response_text?: string;
  machine_generated?: boolean;
};

const { t } = useI18n();
const rows = ref<Insight[]>([]);
const selected = ref<Insight | null>(null);
const edit = ref('');
const attest = ref(false);
const error = ref<string | null>(null);
const status = ref<string | null>(null);
const busy = ref(false);

async function load() {
  rows.value = await api<Insight[]>('/v1/ai/insights');
}

async function generate() {
  busy.value = true;
  error.value = null;
  try {
    const g = await api<Insight>('/v1/ai/insights/generate', {
      method: 'POST',
      body: JSON.stringify({ use_case: 'grant_narrative' }),
    });
    selected.value = g;
    edit.value = g.response_text ?? '';
    status.value = t('ai.generated');
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('ai.failed');
  } finally {
    busy.value = false;
  }
}

async function open(id: string) {
  selected.value = await api<Insight>(`/v1/ai/insights/${id}`);
  edit.value = selected.value.response_text ?? '';
  attest.value = false;
}

async function approve() {
  if (!selected.value) return;
  busy.value = true;
  error.value = null;
  try {
    const body =
      edit.value !== selected.value.response_text
        ? { edited_text: edit.value }
        : { attest_verbatim: true };
    if (!body.edited_text && !attest.value) {
      throw new Error(t('ai.needAttest'));
    }
    await api(`/v1/ai/insights/${selected.value.id}/approve`, {
      method: 'POST',
      body: JSON.stringify(
        body.edited_text ? body : { attest_verbatim: true },
      ),
    });
    status.value = t('ai.approved');
    await load();
    await open(selected.value.id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('ai.failed');
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void load().catch((err) => {
    error.value = err instanceof Error ? err.message : t('ai.failed');
  });
});
</script>

<template>
  <section class="page">
    <PageHeader
      :eyebrow="t('ai.eyebrow')"
      :title="t('ai.title')"
      :lede="t('ai.lede')"
    >
      <template #actions>
        <BaseButton :disabled="busy" @click="generate">{{ t('ai.generate') }}</BaseButton>
      </template>
    </PageHeader>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="status" class="ok">{{ status }}</p>
    <ul class="list">
      <li v-for="r in rows" :key="r.id">
        <button type="button" class="linkish" @click="open(r.id)">
          {{ r.id.slice(0, 8) }} · {{ r.approval_status }}
        </button>
        <span>{{ r.preview }}</span>
      </li>
    </ul>
    <div v-if="selected" class="draft" data-ai="unapproved">
      <p class="label">{{ t('ai.machineLabel') }}</p>
      <textarea v-model="edit" rows="8" />
      <label class="attest">
        <input v-model="attest" type="checkbox" />
        {{ t('ai.attest') }}
      </label>
      <BaseButton :disabled="busy" @click="approve">{{ t('ai.approve') }}</BaseButton>
    </div>
  </section>
</template>

<style scoped>
.page {
  max-width: 42rem;
}
.error {
  color: var(--color-danger, #a33);
}
.ok {
  color: var(--color-ok, #2a6);
}
.list {
  list-style: none;
  padding: 0;
  margin: 1.25rem 0;
  display: grid;
  gap: 0.5rem;
}
.linkish {
  background: none;
  border: 0;
  padding: 0;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}
.draft {
  margin-top: 1.5rem;
  padding: 1rem;
  border: 2px dashed color-mix(in srgb, currentColor 35%, transparent);
  display: grid;
  gap: 0.75rem;
}
.label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
textarea {
  width: 100%;
  font: inherit;
  padding: 0.5rem;
}
.attest {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.9rem;
}
</style>
