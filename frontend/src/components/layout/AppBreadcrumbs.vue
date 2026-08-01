<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const route = useRoute();
const { t } = useI18n();

type Crumb = { to?: string; label: string };

const crumbs = computed((): Crumb[] => {
  const overview = t('app.overview');
  const meta = route.meta;
  const parent = typeof meta.parent === 'string' ? meta.parent : null;
  const parentLabel = typeof meta.parentLabelKey === 'string' ? t(meta.parentLabelKey) : null;
  const titleKey = typeof meta.titleKey === 'string' ? meta.titleKey : 'app.name';
  const label =
    typeof meta.breadcrumbKey === 'string' ? t(meta.breadcrumbKey) : t(titleKey);

  if (route.path === '/' || route.name === 'home') {
    return [{ label: overview }];
  }

  const items: Crumb[] = [{ to: '/', label: overview }];
  if (parent && parentLabel) {
    items.push({ to: parent, label: parentLabel });
  }
  items.push({ label });
  return items;
});
</script>

<template>
  <nav class="crumbs" :aria-label="t('nav.breadcrumbs')">
    <ol>
      <li v-for="(c, i) in crumbs" :key="`${c.label}-${i}`">
        <RouterLink v-if="c.to && i < crumbs.length - 1" :to="c.to">{{ c.label }}</RouterLink>
        <span v-else aria-current="page">{{ c.label }}</span>
        <span v-if="i < crumbs.length - 1" class="sep" aria-hidden="true">/</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.crumbs ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.crumbs a {
  color: var(--brand);
  font-weight: 600;
}
.crumbs a:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
.sep {
  opacity: 0.5;
  margin-inline-end: 0.15rem;
}
[aria-current='page'] {
  color: var(--color-text);
  font-weight: 600;
}
</style>
