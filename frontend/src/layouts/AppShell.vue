<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import LocaleSwitcher from '../components/layout/LocaleSwitcher.vue';
import BaseButton from '../components/base/BaseButton.vue';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();

function logout() {
  auth.logout();
  void router.push({ name: 'login' });
}
</script>

<template>
  <div class="shell">
    <aside class="nav" aria-label="Primary">
      <div class="brand">
        <p class="eyebrow">{{ t('app.shortName') }}</p>
        <p class="brand-name">{{ t('app.name') }}</p>
      </div>
      <nav>
        <RouterLink to="/" exact-active-class="active">{{ t('app.overview') }}</RouterLink>
        <RouterLink to="/grants" active-class="active">{{ t('app.grants') }}</RouterLink>
        <RouterLink to="/finance" active-class="active">{{ t('app.finance') }}</RouterLink>
        <RouterLink to="/reports" active-class="active">{{ t('app.reports') }}</RouterLink>
        <RouterLink to="/employees" active-class="active">{{ t('app.employees') }}</RouterLink>
        <RouterLink to="/leave" active-class="active">{{ t('app.leave') }}</RouterLink>
        <RouterLink to="/payroll" active-class="active">{{ t('app.payroll') }}</RouterLink>
      </nav>
      <div class="footer">
        <LocaleSwitcher />
        <div v-if="auth.user" class="user">
          <strong>{{ auth.user.display_name }}</strong>
          <span>{{ auth.user.role }}</span>
          <BaseButton variant="ghost" class="signout" @click="logout">
            {{ t('app.signOut') }}
          </BaseButton>
        </div>
      </div>
    </aside>
    <main id="main-content" class="main" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}
.nav {
  padding: 1.75rem 1.35rem;
  background: linear-gradient(180deg, var(--brand-deep), var(--brand));
  color: var(--on-brand);
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}
.brand-name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.25;
}
.eyebrow {
  margin: 0 0 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.72rem;
  opacity: 0.75;
}
nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
nav a {
  padding: 0.65rem 0.75rem;
  border-radius: var(--radius-md);
  color: rgba(255, 255, 255, 0.82);
}
nav a.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
nav a:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
.footer {
  margin-block-start: auto;
  display: grid;
  gap: 1rem;
}
.user {
  display: grid;
  gap: 0.25rem;
  font-size: 0.9rem;
}
.user span {
  opacity: 0.7;
}
.signout {
  margin-block-start: 0.6rem;
  border-color: rgba(255, 255, 255, 0.25) !important;
  background: transparent !important;
  color: #fff !important;
}
.main {
  padding: 2.25rem 2.5rem;
}
@media (max-width: 860px) {
  .shell {
    grid-template-columns: 1fr;
  }
}
</style>
