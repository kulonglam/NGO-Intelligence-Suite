<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import PageHeader from '../components/layout/PageHeader.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';

const { t } = useI18n();
</script>

<template>
  <div>
    <PageHeader :title="t('guards.suspendedTitle')" :lede="t('guards.suspendedLede')" />
    <AlertBanner variant="danger" :title="t('guards.suspendedTitle')">
      <p>{{ t('guards.suspendedBody') }}</p>
    </AlertBanner>
  </div>
</template>
