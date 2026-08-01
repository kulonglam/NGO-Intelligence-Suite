<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PageHeader from '../components/layout/PageHeader.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';

const route = useRoute();
const { t } = useI18n();

const moduleId = computed(() =>
  typeof route.query.module === 'string' ? route.query.module : '',
);
const flag = computed(() =>
  typeof route.query.flag === 'string' ? route.query.flag : '',
);
</script>

<template>
  <div>
    <PageHeader :title="t('guards.moduleTitle')" :lede="t('guards.moduleLede')" />
    <AlertBanner variant="info" :title="t('guards.moduleTitle')">
      <p v-if="flag">{{ t('guards.featureBody', { flag }) }}</p>
      <p v-else-if="moduleId">{{ t('guards.moduleBody', { module: moduleId }) }}</p>
      <p v-else>{{ t('guards.moduleLede') }}</p>
      <p>
        <RouterLink to="/">{{ t('app.back') }}</RouterLink>
      </p>
    </AlertBanner>
  </div>
</template>
