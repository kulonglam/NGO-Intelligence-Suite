<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader.vue';
import DataTable from '../components/data/DataTable.vue';
import DataTableToolbar from '../components/data/DataTableToolbar.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';
import CertificateView from '../components/domain/CertificateView.vue';

type Enrollment = {
  id: string;
  status: string;
  due_date?: string;
  is_mandatory: boolean;
  title: string;
  code: string;
};

const { t } = useI18n();
const rows = ref<Enrollment[]>([]);
const compliance = ref<Record<string, number> | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);
const filterQuery = ref('');

const columns = computed(() => [
  { key: 'title', label: t('training.title'), sortable: true },
  { key: 'code', label: 'Code', sortable: true },
  { key: 'status', label: t('grants.status') },
  { key: 'mandatory', label: t('training.mandatory') },
]);

const tableRows = computed(() =>
  rows.value.map((r) => ({
    ...r,
    mandatory: r.is_mandatory ? t('training.mandatory') : '—',
  })),
);

const certificates = computed(() =>
  rows.value.filter((r) => r.status === 'completed' || r.status === 'complete'),
);

onMounted(async () => {
  loading.value = true;
  try {
    rows.value = await api<Enrollment[]>('/v1/lms/my-enrollments');
    compliance.value = await api<Record<string, number>>('/v1/lms/compliance-status');
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('training.failed');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section>
    <PageHeader
      :eyebrow="t('training.eyebrow')"
      :title="t('training.title')"
      :lede="t('training.lede')"
    />
    <AlertBanner v-if="error" variant="danger">{{ error }}</AlertBanner>
    <p v-if="compliance" class="meta">
      {{
        t('training.compliance', {
          total: compliance.mandatory_total ?? 0,
          done: compliance.mandatory_completed ?? 0,
          overdue: compliance.mandatory_overdue ?? 0,
        })
      }}
    </p>
    <div v-if="certificates.length" class="certs">
      <CertificateView
        v-for="c in certificates"
        :key="c.id"
        :title="c.title"
        :code="c.code"
        :issued-at="c.due_date"
      />
    </div>
    <DataTableToolbar v-model="filterQuery" />
    <DataTable
      :columns="columns"
      :rows="tableRows"
      :caption="t('training.title')"
      :loading="loading"
      :empty-title="t('training.empty')"
      :filter-query="filterQuery"
      row-key="id"
    />
  </section>
</template>

<style scoped>
.meta {
  font-size: 0.9rem;
  margin: 0 0 0.85rem;
  color: var(--color-text-muted);
}
.certs {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-block-end: 1rem;
}
</style>
