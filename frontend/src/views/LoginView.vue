<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import BaseButton from '../components/base/BaseButton.vue';
import BaseInput from '../components/base/BaseInput.vue';
import LocaleSwitcher from '../components/layout/LocaleSwitcher.vue';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('admin@design-partner.example');
const password = ref('changeme');
const localError = ref<string | null>(null);

async function submit() {
  localError.value = null;
  try {
    await auth.login(email.value, password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.push(redirect);
  } catch (err) {
    localError.value = err instanceof Error ? err.message : t('login.failed');
  }
}
</script>

<template>
  <div class="page">
    <div class="locale-wrap">
      <LocaleSwitcher />
    </div>
    <section class="hero" aria-labelledby="login-hero">
      <p class="eyebrow">{{ t('login.eyebrow') }}</p>
      <h1 id="login-hero">{{ t('login.title') }}</h1>
      <p class="lede">{{ t('login.lede') }}</p>
    </section>

    <form class="card" @submit.prevent="submit" aria-labelledby="login-heading">
      <h2 id="login-heading">{{ t('login.heading') }}</h2>
      <BaseInput
        v-model="email"
        :label="t('login.email')"
        type="email"
        autocomplete="username"
        required
        ltr
      />
      <BaseInput
        v-model="password"
        :label="t('login.password')"
        type="password"
        autocomplete="current-password"
        required
        ltr
      />
      <p v-if="localError" class="error" role="alert">{{ localError }}</p>
      <BaseButton type="submit" :disabled="auth.loading">
        {{ auth.loading ? t('login.submitting') : t('login.submit') }}
      </BaseButton>
      <p class="hint">{{ t('login.hint') }}</p>
    </form>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 2.5rem;
  padding: 3rem;
  align-items: center;
  position: relative;
}
.locale-wrap {
  position: absolute;
  inset-block-start: 1.25rem;
  inset-inline-end: 1.25rem;
}
.locale-wrap :deep(select) {
  border-color: var(--line);
  background: var(--surface);
  color: var(--ink);
}
.hero {
  max-width: 34rem;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.75rem;
  color: var(--brand);
  font-weight: 600;
}
h1 {
  font-size: clamp(2.4rem, 4vw, 3.6rem);
  margin: 0.65rem 0 1rem;
  color: var(--brand-deep);
}
.lede {
  color: var(--ink-muted);
  font-size: 1.05rem;
}
.card {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--line);
  border-radius: 1.1rem;
  padding: 1.75rem;
  box-shadow: var(--shadow);
  display: grid;
  gap: 0.9rem;
}
.error {
  color: var(--danger);
  margin: 0;
}
.hint {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.85rem;
}
@media (max-width: 900px) {
  .page {
    grid-template-columns: 1fr;
    padding: 1.75rem;
  }
}
</style>
