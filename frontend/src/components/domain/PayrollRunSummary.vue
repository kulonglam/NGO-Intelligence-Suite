<script setup lang="ts">
import GrantStatusBadge from './GrantStatusBadge.vue';

defineProps<{
  period: string;
  status: string;
  gross: string;
  net: string;
  grossLabel?: string;
  netLabel?: string;
}>();
</script>

<template>
  <div class="summary">
    <div class="main">
      <strong class="period">{{ period }}</strong>
      <GrantStatusBadge :status="status" />
    </div>
    <dl class="figures">
      <div>
        <dt>{{ grossLabel ?? 'Gross' }}</dt>
        <dd dir="ltr">{{ gross }}</dd>
      </div>
      <div>
        <dt>{{ netLabel ?? 'Net' }}</dt>
        <dd dir="ltr">{{ net }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
}
.main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.period {
  font-size: var(--text-lg);
  color: var(--brand-deep);
}
.figures {
  margin: 0;
  display: flex;
  gap: var(--space-5);
}
.figures dt {
  margin: 0;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}
.figures dd {
  margin: 0.15rem 0 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
