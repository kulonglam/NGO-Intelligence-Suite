<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '../components/base/BaseButton.vue';
import BaseInput from '../components/base/BaseInput.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import { useConnectivityStore } from '../stores/connectivity';
import { listQueue, type CachedForm } from '../offline/db';
import { loadLocalForms, pullAssignedForms, runSync, saveDraftLocally } from '../offline/sync';

const { t } = useI18n();
const connectivity = useConnectivityStore();

const forms = ref<CachedForm[]>([]);
const queueCount = ref(0);
const selectedVersion = ref('');
const settlement = ref('');
const householdSize = ref('4');
const notes = ref('');
const error = ref<string | null>(null);
const status = ref<string | null>(null);
const busy = ref(false);

async function refresh() {
  forms.value = await loadLocalForms();
  if (!selectedVersion.value && forms.value[0]) {
    selectedVersion.value = forms.value[0].form_version_id;
  }
  queueCount.value = (await listQueue()).length;
}

async function pull() {
  busy.value = true;
  error.value = null;
  try {
    forms.value = await pullAssignedForms();
    if (forms.value[0]) selectedVersion.value = forms.value[0].form_version_id;
    status.value = t('field.pulled', { count: forms.value.length });
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('field.failed');
  } finally {
    busy.value = false;
  }
}

async function queueLocal() {
  busy.value = true;
  error.value = null;
  status.value = null;
  try {
    if (!selectedVersion.value) throw new Error(t('field.noForm'));
    await saveDraftLocally({
      form_version_id: selectedVersion.value,
      payload: {
        settlement: settlement.value,
        household_size: householdSize.value,
        notes: notes.value,
      },
    });
    settlement.value = '';
    notes.value = '';
    await refresh();
    status.value = t('field.queued');
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('field.failed');
  } finally {
    busy.value = false;
  }
}

async function syncNow() {
  busy.value = true;
  error.value = null;
  try {
    const r = await runSync();
    await refresh();
    status.value = t('field.synced', { uploaded: r.uploaded, replayed: r.replayed });
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('field.failed');
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <section>
    <PageHeader
      :eyebrow="t('field.eyebrow')"
      :title="t('field.title')"
      :lede="t('field.lede')"
    >
      <template #actions>
        <BaseButton :disabled="busy || !connectivity.online" @click="pull">
          {{ t('field.pullForms') }}
        </BaseButton>
        <BaseButton :disabled="busy || !connectivity.online" @click="syncNow">
          {{ t('field.sync') }}
        </BaseButton>
      </template>
    </PageHeader>

    <p class="meta" role="status">
      {{ connectivity.online ? t('app.online') : t('app.offline') }}
      · {{ t('field.queueCount', { count: queueCount }) }}
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="status" class="ok" role="status">{{ status }}</p>

    <form class="create" @submit.prevent="queueLocal">
      <label class="field">
        <span>{{ t('field.form') }}</span>
        <select v-model="selectedVersion" required>
          <option v-for="f in forms" :key="f.form_version_id" :value="f.form_version_id">
            {{ f.code }} — {{ f.title }} (v{{ f.version_number }})
          </option>
        </select>
      </label>
      <BaseInput v-model="settlement" :label="t('field.settlement')" required />
      <BaseInput
        v-model="householdSize"
        type="number"
        :label="t('field.householdSize')"
        required
      />
      <BaseInput v-model="notes" :label="t('field.notes')" />
      <BaseButton type="submit" :disabled="busy">{{ t('field.saveLocal') }}</BaseButton>
    </form>
  </section>
</template>

<style scoped>
.meta {
  margin: 1rem 0;
  color: var(--muted);
}
.create {
  display: grid;
  gap: 0.75rem;
  max-width: 28rem;
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
.error {
  color: var(--danger);
}
.ok {
  color: var(--success, #0a7a3e);
}
</style>
