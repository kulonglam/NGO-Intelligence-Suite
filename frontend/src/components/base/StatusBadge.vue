<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { statusLabel } from '../../lib/format';

const props = defineProps<{ status: string }>();
const { t } = useI18n();
</script>

<template>
  <span class="badge" :data-status="status">
    <span class="dot" aria-hidden="true" />
    <span class="text">{{ statusLabel(t, props.status) }}</span>
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.55rem;
  border-radius: var(--radius-pill);
  background: var(--paper-2);
  font-size: 0.82rem;
  font-weight: 600;
}
.dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--ink-muted);
}
.badge[data-status='active'] .dot,
.badge[data-status='approved'] .dot {
  background: var(--ok);
}
.badge[data-status='pending_approval'] .dot,
.badge[data-status='submitted'] .dot {
  background: var(--accent);
}
.badge[data-status='cancelled'] .dot,
.badge[data-status='reversed'] .dot {
  background: var(--danger);
}
</style>
