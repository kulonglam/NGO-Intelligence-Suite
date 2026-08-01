<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import { useTenantStore } from '../stores/tenant';
import { NAV_GROUPS, paletteItemsFromNav } from '../lib/nav';
import { prefetchRoute } from '../lib/prefetch';
import LocaleSwitcher from '../components/layout/LocaleSwitcher.vue';
import ThemeSwitcher from '../components/layout/ThemeSwitcher.vue';
import AppBreadcrumbs from '../components/layout/AppBreadcrumbs.vue';
import AppSidebar from '../components/layout/AppSidebar.vue';
import AppHeader from '../components/layout/AppHeader.vue';
import CommandPalette from '../components/layout/CommandPalette.vue';
import BaseButton from '../components/base/BaseButton.vue';
import ToastContainer from '../components/feedback/ToastContainer.vue';
import SessionBanner from '../components/feedback/SessionBanner.vue';

const { t } = useI18n();
const auth = useAuthStore();
const tenant = useTenantStore();
const router = useRouter();
const route = useRoute();

const openGroups = ref<Record<string, boolean>>({});
const drawerOpen = ref(false);
const paletteOpen = ref(false);
const menuBtn = ref<HTMLButtonElement | null>(null);
const sidebarRef = ref<InstanceType<typeof AppSidebar> | null>(null);
const searchBtn = ref<HTMLButtonElement | null>(null);

const visibleGroups = computed(() =>
  NAV_GROUPS.map((g) => ({
    id: g.id,
    label: t(g.labelKey),
    items: g.items
      .filter(
        (item) =>
          auth.canAny(item.anyOf) &&
          tenant.moduleEnabled(item.module) &&
          tenant.featureEnabled(item.featureFlag),
      )
      .map((item) => ({
        to: item.to,
        label: t(item.labelKey),
        exact: item.exact,
      })),
  })).filter((g) => g.items.length > 0),
);

function onPrefetch(to: string) {
  prefetchRoute(router, to);
}

const paletteItems = computed(() => paletteItemsFromNav());

function groupContainsPath(group: (typeof NAV_GROUPS)[number], path: string) {
  return group.items.some((item) =>
    item.exact ? path === item.to : path === item.to || path.startsWith(`${item.to}/`),
  );
}

function syncOpenGroups() {
  const next: Record<string, boolean> = { ...openGroups.value };
  for (const g of NAV_GROUPS) {
    if (!visibleGroups.value.some((v) => v.id === g.id)) continue;
    if (groupContainsPath(g, route.path)) next[g.id] = true;
    else if (next[g.id] === undefined) next[g.id] = false;
  }
  openGroups.value = next;
}

function toggleGroup(id: string) {
  openGroups.value = { ...openGroups.value, [id]: !openGroups.value[id] };
}

function logout() {
  auth.logout();
  void router.push({ name: 'login' });
}

function closeDrawer() {
  drawerOpen.value = false;
  void nextTick(() => menuBtn.value?.focus());
}

function openDrawer() {
  drawerOpen.value = true;
}

function drawerRoot(): HTMLElement | null {
  return (sidebarRef.value?.$el as HTMLElement | undefined) ?? null;
}

function onGlobalKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    paletteOpen.value = true;
  }
  if (e.key === 'Escape' && drawerOpen.value) {
    e.preventDefault();
    closeDrawer();
  }
  const el = drawerRoot();
  if (e.key === 'Tab' && drawerOpen.value && el) {
    const focusable = [
      ...el.querySelectorAll<HTMLElement>(
        'a[href], button, select, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((node) => !node.hasAttribute('disabled'));
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

const pageTitle = computed(() => {
  const key = typeof route.meta.titleKey === 'string' ? route.meta.titleKey : 'app.name';
  return t(key);
});

const tenantLabel = computed(() => auth.user?.tenant_id?.slice(0, 8) ?? '—');

watch(
  () => route.path,
  () => {
    syncOpenGroups();
    if (drawerOpen.value) closeDrawer();
  },
);

onMounted(() => {
  syncOpenGroups();
  document.addEventListener('keydown', onGlobalKey);
});
onUnmounted(() => document.removeEventListener('keydown', onGlobalKey));
</script>

<template>
  <div class="shell" :class="{ 'drawer-open': drawerOpen }">
    <div v-if="drawerOpen" class="scrim" aria-hidden="true" @click="closeDrawer" />
    <AppSidebar
      ref="sidebarRef"
      id="app-nav"
      :brand-eyebrow="t('app.name')"
      :brand-title="t('app.shortName')"
      :groups="visibleGroups"
      :open-groups="openGroups"
      @toggle-group="toggleGroup"
      @prefetch="onPrefetch"
    >
      <template #footer>
        <div class="footer desktop-only">
          <LocaleSwitcher variant="onBrand" />
          <ThemeSwitcher variant="onBrand" />
          <div v-if="auth.user" class="user">
            <strong>{{ auth.user.display_name }}</strong>
            <span>{{ auth.user.role }}</span>
            <BaseButton variant="ghost" class="signout" @click="logout">
              {{ t('app.signOut') }}
            </BaseButton>
          </div>
        </div>
      </template>
    </AppSidebar>

    <div class="content">
      <SessionBanner />
      <AppHeader>
        <template #start>
          <button
            ref="menuBtn"
            type="button"
            class="menu-btn"
            :aria-expanded="drawerOpen"
            aria-controls="app-nav"
            @click="drawerOpen ? closeDrawer() : openDrawer()"
          >
            {{ drawerOpen ? t('nav.closeMenu') : t('nav.openMenu') }}
          </button>
        </template>
        <template #main>
          <AppBreadcrumbs />
          <p class="context">{{ pageTitle }}</p>
        </template>
        <template #actions>
          <button
            ref="searchBtn"
            type="button"
            class="search-btn"
            @click="paletteOpen = true"
          >
            {{ t('search.open') }}
            <kbd>⌘K</kbd>
          </button>
          <span class="tenant" :title="auth.user?.tenant_id">{{
            t('nav.tenant', { id: tenantLabel })
          }}</span>
          <ThemeSwitcher variant="surface" />
          <LocaleSwitcher variant="surface" />
          <BaseButton v-if="auth.user" variant="ghost" class="signout-top" @click="logout">
            {{ t('app.signOut') }}
          </BaseButton>
        </template>
      </AppHeader>
      <main id="main-content" class="main" tabindex="-1">
        <RouterView />
      </main>
    </div>
    <CommandPalette v-model:open="paletteOpen" :items="paletteItems" />
    <ToastContainer />
  </div>
</template>

<style scoped>
.shell {
  display: block;
  min-height: 100vh;
}
.scrim {
  display: none;
}
.footer {
  display: grid;
  gap: 0.85rem;
}
.user {
  display: grid;
  gap: 0.2rem;
  font-size: 0.85rem;
}
.user span {
  opacity: 0.7;
}
.signout {
  margin-block-start: 0.35rem;
  border-color: rgba(255, 255, 255, 0.25) !important;
  background: transparent !important;
  color: #fff !important;
}
.signout-top {
  margin: 0;
}
.content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 100vh;
  min-height: 100dvh;
  margin-inline-start: var(--sidebar-width);
}
.context {
  margin: 0;
  font-weight: 600;
  color: var(--brand-deep);
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  border-radius: var(--radius-pill);
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.search-btn kbd {
  font-size: 0.72rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
}
.search-btn:focus-visible,
.menu-btn:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.tenant {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.main {
  padding: 1.5rem 1.75rem 2rem;
  width: 100%;
  max-width: var(--content-max-width);
  box-sizing: border-box;
}
.menu-btn {
  display: none;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: var(--radius-pill);
  padding: 0.45rem 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
@media (max-width: 960px) {
  .content {
    margin-inline-start: 0;
  }
  .menu-btn {
    display: inline-flex;
  }
  .desktop-only {
    display: none;
  }
  .search-btn kbd {
    display: none;
  }
  :deep(.sidebar) {
    z-index: 40;
    transform: translateX(-105%);
    transition: transform var(--duration-base) var(--ease-standard);
  }
  :global(html[dir='rtl']) .shell :deep(.sidebar) {
    transform: translateX(105%);
  }
  .shell.drawer-open :deep(.sidebar),
  :global(html[dir='rtl']) .shell.drawer-open :deep(.sidebar) {
    transform: translateX(0);
  }
  .scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 30;
    background: var(--color-overlay);
  }
  .main {
    padding: 1.1rem 1rem 2rem;
  }
}
</style>
