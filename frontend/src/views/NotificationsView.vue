<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader.vue';
import EmptyState from '../components/feedback/EmptyState.vue';

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

onMounted(async () => {
  try {
    rows.value = await api<Delivery[]>('/v1/notifications/deliveries');
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('notifications.failed');
  }
});
</script>

<template>
  <section class="page">
    <PageHeader
      :eyebrow="t('notifications.eyebrow')"
      :title="t('notifications.title')"
      :lede="t('notifications.lede')"
    />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <ul v-if="rows.length" class="list">
      <li v-for="r in rows" :key="r.id">
        <strong>{{ r.template_code }}</strong>
        <span>{{ r.channel }} · {{ r.status }}</span>
        <span class="addr">{{ r.recipient_address }}</span>
      </li>
    </ul>
    <EmptyState v-else :title="t('notifications.empty')" />
  </section>
</template>

<style scoped>
.page {
  max-width: 40rem;
}
.error {
  color: var(--color-danger, #a33);
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
.addr {
  font-size: 0.85rem;
  opacity: 0.75;
}
</style>
