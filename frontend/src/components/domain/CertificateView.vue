<script setup lang="ts">
defineProps<{
  title: string;
  code: string;
  issuedAt?: string;
  holderName?: string;
}>();
</script>

<template>
  <article class="cert">
    <p class="eyebrow">Certificate</p>
    <h3>{{ title }}</h3>
    <p class="code" dir="ltr">{{ code }}</p>
    <p v-if="holderName">{{ holderName }}</p>
    <p v-if="issuedAt" class="meta" dir="ltr">{{ issuedAt }}</p>
  </article>
</template>

<style scoped>
.cert {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 8%, transparent), transparent),
    var(--color-surface);
  max-width: 22rem;
}
.eyebrow {
  margin: 0 0 var(--space-2);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.7rem;
  color: var(--color-text-muted);
}
h3 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xl);
}
.code {
  margin: 0 0 var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
.meta {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
