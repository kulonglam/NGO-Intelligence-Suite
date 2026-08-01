<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader.vue';
import DataTable from '../components/data/DataTable.vue';
import DataTableToolbar from '../components/data/DataTableToolbar.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';

type Delivery = {
  id: string;
  template_code: string;
  channel: string;
  recipient_address: string;
  status: string;
  queued_at: string;
};

const { t } = useI18n();
const rows = ref<Delivery[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
const filterQuery = ref('');

const columns = computed(() => [
  { key: 'template_code', label: t('notifications.title'), sortable: true },
  { key: 'channel', label: 'Channel', sortable: true },
  { key: 'status', label: t('grants.status') },
  { key: 'recipient_address', label: 'Recipient' },
]);

onMounted(async () => {
  loading.value = true;
  try {
    rows.value = await api<Delivery[]>('/v1/notifications/deliveries');
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('notifications.failed');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section>
    <PageHeader
      :eyebrow="t('notifications.eyebrow')"
      :title="t('notifications.title')"
      :lede="t('notifications.lede')"
    />
    <AlertBanner v-if="error" variant="danger">{{ error }}</AlertBanner>
    <DataTableToolbar v-model="filterQuery" />
    <DataTable
      :columns="columns"
      :rows="rows"
      :caption="t('notifications.title')"
      :loading="loading"
      :empty-title="t('notifications.empty')"
      :filter-query="filterQuery"
      row-key="id"
    />
  </section>
</template>
