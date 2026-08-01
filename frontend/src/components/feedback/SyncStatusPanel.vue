<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  online: boolean;
  queueCount: number;
  lastSync?: string | null;
  statusMessage?: string | null;
}>();

const { t } = useI18n();
</script>

<template>
  <section class="panel" aria-live="polite">
    <div class="status">
      <span class="dot" :class="{ online, offline: !online }" aria-hidden="true" />
      <div class="meta">
        <p class="line">
          {{ online ? t('app.online') : t('app.offline') }}
          <span v-if="queueCount > 0"> · {{ t('field.queueCount', { count: queueCount }) }}</span>
        </p>
        <p v-if="statusMessage" class="msg">{{ statusMessage }}</p>
        <p v-if="lastSync" class="msg">{{ lastSync }}</p>
      </div>
    </div>
    <div v-if="$slots.actions" class="actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.status {
  display: flex;
  align-items: start;
  gap: var(--space-3);
  min-width: 0;
}
.dot {
  width: 0.65rem;
  height: 0.65rem;
  margin-block-start: 0.35rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot.online {
  background: var(--color-success);
}
.dot.offline {
  background: var(--color-danger);
}
.meta {
  min-width: 0;
}
.line {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--color-text);
}
.msg {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
