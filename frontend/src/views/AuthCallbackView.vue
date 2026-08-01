<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';

const { t } = useI18n();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const error = ref<string | null>(null);

onMounted(async () => {
  const state = typeof route.query.state === 'string' ? route.query.state : '';
  const code = typeof route.query.code === 'string' ? route.query.code : undefined;
  const redirect =
    typeof route.query.redirect === 'string' ? route.query.redirect : '/';

  if (!state) {
    error.value = t('login.oidcMissingState');
    return;
  }

  try {
    await auth.completeOidc(state, code);
    await router.replace(redirect);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('login.oidcFailed');
  }
});
</script>

<template>
  <div class="page">
    <main id="main-content" class="main" tabindex="-1">
      <p v-if="!error" class="status">{{ t('login.oidcCompleting') }}</p>
      <p v-else class="error" role="alert">{{ error }}</p>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper);
}
.main {
  padding: 2rem;
  text-align: center;
}
.status {
  color: var(--ink-muted);
}
.error {
  color: var(--danger);
}
</style>
