<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { useToastStore } from '../../stores/toast';
import BaseButton from '../base/BaseButton.vue';
import AlertBanner from './AlertBanner.vue';

const WARN_MS = 2 * 60 * 1000;
const { t } = useI18n();
const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const now = ref(Date.now());
let timer: number | undefined;
let toasted = false;

const remainingMs = computed(() => {
  if (!auth.sessionExpiresAt) return null;
  return auth.sessionExpiresAt - now.value;
});

const show = computed(() => {
  const r = remainingMs.value;
  return r != null && r > 0 && r <= WARN_MS;
});

const minutesLeft = computed(() => {
  const r = remainingMs.value;
  if (r == null) return 0;
  return Math.max(1, Math.ceil(r / 60_000));
});

function extendSession() {
  const redirect = router.currentRoute.value.fullPath;
  auth.logout();
  void router.push({ name: 'login', query: { redirect } });
}

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
    const r = remainingMs.value;
    if (r != null && r <= WARN_MS && r > 0 && !toasted) {
      toasted = true;
      toast.info(t('session.warnToast', { minutes: minutesLeft.value }));
    }
    if (r != null && r <= 0) {
      auth.logout();
      void router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } });
    }
  }, 15_000);
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<template>
  <AlertBanner
    v-if="show"
    variant="warning"
    :title="t('session.warnBanner', { minutes: minutesLeft })"
  >
    <BaseButton variant="secondary" @click="extendSession">{{ t('session.extend') }}</BaseButton>
  </AlertBanner>
</template>
