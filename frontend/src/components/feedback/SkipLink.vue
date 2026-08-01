<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <a class="skip" href="#main-content">{{ t('app.skipToContent') }}</a>
</template>

<style scoped>
.skip {
  position: absolute;
  inset-inline-start: 1rem;
  inset-block-start: 0;
  z-index: 1000;
  padding: 0.75rem 1rem;
  background: var(--brand-deep);
  color: #fff;
  border-radius: var(--radius-md);
  font-weight: 600;
  transform: translateY(-120%);
  transition: transform 0.15s ease;
}
.skip:focus,
.skip:focus-visible {
  transform: translateY(1rem);
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .skip {
    transition: none;
  }
}
</style>
