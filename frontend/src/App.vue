<script setup lang="ts">
import { RouterView } from 'vue-router';
import SkipLink from './components/feedback/SkipLink.vue';
import OfflineIndicator from './components/feedback/OfflineIndicator.vue';
import { useConnectivityLifecycle } from './stores/connectivity';

useConnectivityLifecycle();
</script>

<template>
  <SkipLink />
  <OfflineIndicator />
  <RouterView />
</template>
