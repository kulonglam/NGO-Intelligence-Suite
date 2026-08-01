<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader.vue';
import EmptyState from '../components/feedback/EmptyState.vue';

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

onMounted(async () => {
  try {
    rows.value = await api<Enrollment[]>('/v1/lms/my-enrollments');
    compliance.value = await api<Record<string, number>>('/v1/lms/compliance-status');
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('training.failed');
  }
});
</script>

<template>
  <section class="page">
    <PageHeader
      :eyebrow="t('training.eyebrow')"
      :title="t('training.title')"
      :lede="t('training.lede')"
    />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="compliance" class="meta">
      {{
        t('training.compliance', {
          total: compliance.mandatory_total ?? 0,
          done: compliance.mandatory_completed ?? 0,
          overdue: compliance.mandatory_overdue ?? 0,
        })
      }}
    </p>
    <ul v-if="rows.length" class="list">
      <li v-for="r in rows" :key="r.id">
        <strong>{{ r.title }}</strong>
        <span>{{ r.code }} · {{ r.status }}</span>
        <span v-if="r.is_mandatory">{{ t('training.mandatory') }}</span>
      </li>
    </ul>
    <EmptyState v-else :title="t('training.empty')" />
  </section>
</template>

<style scoped>
.page {
  max-width: 40rem;
}
.error {
  color: var(--color-danger, #a33);
}
.meta {
  font-size: 0.9rem;
}
.list {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0;
  display: grid;
  gap: 0.75rem;
}
.list li {
  display: grid;
  gap: 0.15rem;
  padding-block: 0.5rem;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
}
</style>
