<script setup lang="ts">
import { RouterView } from 'vue-router';
import SkipLink from './components/feedback/SkipLink.vue';
import OfflineBanner from './components/feedback/OfflineBanner.vue';
import { useConnectivityLifecycle } from './stores/connectivity';

useConnectivityLifecycle();
</script>

<template>
  <SkipLink />
  <OfflineBanner />
  <RouterView />
</template>
