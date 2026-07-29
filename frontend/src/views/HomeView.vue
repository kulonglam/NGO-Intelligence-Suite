<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';

const { t } = useI18n();
const auth = useAuthStore();

const welcome = computed(() =>
  auth.user ? t('home.welcomeNamed', { name: auth.user.display_name }) : t('home.welcome'),
);
</script>

<template>
  <section aria-labelledby="home-heading">
    <p class="eyebrow">{{ t('home.eyebrow') }}</p>
    <h1 id="home-heading">{{ welcome }}</h1>
    <p class="lede">{{ t('home.lede') }}</p>
    <div class="grid">
      <article>
        <h2>{{ t('home.identityTitle') }}</h2>
        <p>{{ t('home.identityBody') }}</p>
      </article>
      <article>
        <h2>{{ t('home.tenancyTitle') }}</h2>
        <p>{{ t('home.tenancyBody') }}</p>
      </article>
      <article>
        <h2>{{ t('home.grantsTitle') }}</h2>
        <p>{{ t('home.grantsBody') }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
  color: var(--brand);
  font-weight: 600;
}
h1 {
  font-size: 2.4rem;
  margin: 0.5rem 0 0.75rem;
  color: var(--brand-deep);
}
.lede {
  max-width: 42rem;
  color: var(--ink-muted);
}
.grid {
  margin-block-start: 1.75rem;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}
article {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 1.1rem;
}
article h2 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}
article p {
  margin: 0;
  color: var(--ink-muted);
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
