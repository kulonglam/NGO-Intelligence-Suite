<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useConnectivityStore } from '../../stores/connectivity';

const { t } = useI18n();
const connectivity = useConnectivityStore();
</script>

<template>
  <div
    v-if="!connectivity.online || connectivity.justReconnected"
    class="banner"
    :class="{ offline: !connectivity.online, online: connectivity.justReconnected && connectivity.online }"
    role="status"
    aria-live="polite"
  >
    {{ connectivity.online ? t('app.online') : t('app.offline') }}
  </div>
</template>

<style scoped>
.banner {
  padding: 0.55rem 1rem;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 600;
}
.offline {
  background: #5c2b2b;
  color: #fff;
}
.online {
  background: var(--ok);
  color: #fff;
}
</style>
