<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PageHeader from '../components/layout/PageHeader.vue';
import AlertBanner from '../components/feedback/AlertBanner.vue';

const route = useRoute();
const { t } = useI18n();

const permission = computed(() =>
  typeof route.query.permission === 'string' ? route.query.permission : '',
);
</script>

<template>
  <div>
    <PageHeader :title="t('guards.forbiddenTitle')" :lede="t('guards.forbiddenLede')" />
    <AlertBanner variant="warning" :title="t('guards.forbiddenTitle')">
      <p v-if="permission">
        {{ t('guards.forbiddenPermission', { permission }) }}
      </p>
      <p v-else>{{ t('nav.forbidden') }}</p>
      <p>
        <RouterLink to="/">{{ t('app.back') }}</RouterLink>
      </p>
    </AlertBanner>
  </div>
</template>
