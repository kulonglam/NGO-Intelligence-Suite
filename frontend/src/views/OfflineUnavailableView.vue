<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import PageHeader from '../components/layout/PageHeader.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';

const { t } = useI18n();
</script>

<template>
  <div>
    <PageHeader :title="t('guards.offlineTitle')" :lede="t('guards.offlineLede')" />
    <AlertBanner variant="warning" :title="t('guards.offlineTitle')">
      <p>{{ t('guards.offlineBody') }}</p>
      <p>
        <RouterLink to="/">{{ t('app.overview') }}</RouterLink>
      </p>
    </AlertBanner>
  </div>
</template>
