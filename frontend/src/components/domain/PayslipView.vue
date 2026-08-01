<script setup lang="ts">
export type PayslipLine = { label: string; amount: string };

defineProps<{
  employeeName: string;
  period: string;
  lines: PayslipLine[];
  net: string;
  currency?: string;
}>();
</script>

<template>
  <article class="payslip">
    <header>
      <h3>{{ employeeName }}</h3>
      <p>{{ period }}</p>
    </header>
    <ul>
      <li v-for="(line, i) in lines" :key="i">
        <span>{{ line.label }}</span>
        <span dir="ltr">{{ currency ? `${currency} ` : '' }}{{ line.amount }}</span>
      </li>
    </ul>
    <footer>
      <strong>Net</strong>
      <strong dir="ltr">{{ currency ? `${currency} ` : '' }}{{ net }}</strong>
    </footer>
  </article>
</template>

<style scoped>
.payslip {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  padding: var(--space-4);
  max-width: 24rem;
}
header h3 {
  margin: 0 0 0.25rem;
  font-size: var(--text-lg);
}
header p {
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
li,
footer {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-variant-numeric: tabular-nums;
}
footer {
  margin-block-start: var(--space-3);
  padding-block-start: var(--space-3);
  border-top: 1px solid var(--color-border);
}
</style>
