<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import LocaleSwitcher from '../components/layout/LocaleSwitcher.vue';
import BaseButton from '../components/base/BaseButton.vue';
import ToastHost from '../components/feedback/ToastHost.vue';

type NavItem = { to: string; labelKey: string; exact?: boolean };
type NavGroup = { id: string; labelKey: string; items: NavItem[] };

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const groups: NavGroup[] = [
  {
    id: 'overview',
    labelKey: 'nav.overview',
    items: [{ to: '/', labelKey: 'app.overview', exact: true }],
  },
  {
    id: 'programmes',
    labelKey: 'nav.programmes',
    items: [
      { to: '/grants', labelKey: 'app.grants' },
      { to: '/finance', labelKey: 'app.finance' },
      { to: '/reports', labelKey: 'app.reports' },
    ],
  },
  {
    id: 'workforce',
    labelKey: 'nav.workforce',
    items: [
      { to: '/employees', labelKey: 'app.employees' },
      { to: '/leave', labelKey: 'app.leave' },
      { to: '/payroll', labelKey: 'app.payroll' },
      { to: '/training', labelKey: 'app.training' },
    ],
  },
  {
    id: 'field',
    labelKey: 'nav.field',
    items: [{ to: '/field', labelKey: 'app.field' }],
  },
  {
    id: 'intelligence',
    labelKey: 'nav.intelligence',
    items: [
      { to: '/intelligence', labelKey: 'app.intelligence' },
      { to: '/ai', labelKey: 'app.ai' },
      { to: '/compliance', labelKey: 'app.compliance' },
    ],
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    items: [
      { to: '/notifications', labelKey: 'app.notifications' },
      { to: '/settings/webhooks', labelKey: 'app.webhooks' },
    ],
  },
];

function groupContainsPath(group: NavGroup, path: string) {
  return group.items.some((item) =>
    item.exact ? path === item.to : path === item.to || path.startsWith(`${item.to}/`),
  );
}

const openGroups = ref<Record<string, boolean>>({});
const drawerOpen = ref(false);
const menuBtn = ref<HTMLButtonElement | null>(null);
const drawerEl = ref<HTMLElement | null>(null);

function syncOpenGroups() {
  const next: Record<string, boolean> = { ...openGroups.value };
  for (const g of groups) {
    // Active route's group always open; others keep user toggle state (default closed).
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

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && drawerOpen.value) {
    e.preventDefault();
    closeDrawer();
  }
  if (e.key === 'Tab' && drawerOpen.value && drawerEl.value) {
    const focusable = [
      ...drawerEl.value.querySelectorAll<HTMLElement>(
        'a[href], button, select, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => !el.hasAttribute('disabled'));
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

watch(
  () => route.path,
  () => {
    syncOpenGroups();
    if (drawerOpen.value) closeDrawer();
  },
);

onMounted(() => {
  syncOpenGroups();
  document.addEventListener('keydown', onKey);
});
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="shell" :class="{ 'drawer-open': drawerOpen }">
    <div
      v-if="drawerOpen"
      class="scrim"
      aria-hidden="true"
      @click="closeDrawer"
    />
    <aside
      ref="drawerEl"
      id="app-nav"
      class="nav"
      aria-label="Primary"
      :aria-hidden="false"
    >
      <div class="brand">
        <p class="eyebrow">{{ t('app.shortName') }}</p>
        <p class="brand-name">{{ t('app.name') }}</p>
      </div>
      <nav>
        <div v-for="group in groups" :key="group.id" class="group">
          <button
            type="button"
            class="group-toggle"
            :aria-expanded="Boolean(openGroups[group.id])"
            :aria-controls="`nav-group-${group.id}`"
            @click="toggleGroup(group.id)"
          >
            <span>{{ t(group.labelKey) }}</span>
            <span class="chev" aria-hidden="true">{{ openGroups[group.id] ? '▾' : '▸' }}</span>
          </button>
          <div
            v-show="openGroups[group.id]"
            :id="`nav-group-${group.id}`"
            class="group-items"
          >
            <RouterLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              :active-class="item.exact ? '' : 'active'"
              exact-active-class="active"
            >
              {{ t(item.labelKey) }}
            </RouterLink>
          </div>
        </div>
      </nav>
      <div class="footer desktop-only">
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

    <div class="content">
      <header class="topbar">
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
        <p class="context">{{ pageTitle }}</p>
        <div class="top-actions">
          <LocaleSwitcher />
          <BaseButton v-if="auth.user" variant="ghost" class="signout-top" @click="logout">
            {{ t('app.signOut') }}
          </BaseButton>
        </div>
      </header>
      <main id="main-content" class="main" tabindex="-1">
        <RouterView />
      </main>
    </div>
    <ToastHost />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  min-height: 100vh;
}
.scrim {
  display: none;
}
.nav {
  padding: 1.75rem 1.35rem;
  background: linear-gradient(180deg, var(--brand-deep), var(--brand));
  color: var(--on-brand);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-height: 100vh;
  position: sticky;
  inset-block-start: 0;
  max-height: 100vh;
  overflow: auto;
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
.group {
  display: grid;
  gap: 0.25rem;
}
.group-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0.45rem 0.5rem;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.group-toggle:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
.group-items {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-inline-start: 0.25rem;
}
nav a {
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius-md);
  color: rgba(255, 255, 255, 0.82);
}
nav a.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
nav a:focus-visible,
.menu-btn:focus-visible {
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
.signout,
.signout-top {
  margin-block-start: 0.4rem;
  border-color: rgba(255, 255, 255, 0.25) !important;
  background: transparent !important;
  color: #fff !important;
}
.content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.topbar {
  display: none;
  position: sticky;
  inset-block-start: 0;
  z-index: 20;
  min-height: var(--header-height);
  padding: 0.65rem 1rem;
  align-items: center;
  gap: 0.75rem;
  background: color-mix(in srgb, var(--paper) 92%, white);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: blur(8px);
}
.context {
  margin: 0;
  font-weight: 600;
  color: var(--brand-deep);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.main {
  padding: 2.25rem 2.5rem;
  max-width: var(--content-max-width);
}
.menu-btn {
  display: none;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: var(--radius-pill);
  padding: 0.5rem 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.menu-btn:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
@media (max-width: 860px) {
  .shell {
    grid-template-columns: 1fr;
  }
  .topbar {
    display: flex;
  }
  .menu-btn {
    display: inline-flex;
  }
  .desktop-only {
    display: none;
  }
  .nav {
    position: fixed;
    inset-block: 0;
    inset-inline-start: 0;
    width: min(var(--sidebar-width), 88vw);
    z-index: 40;
    transform: translateX(-105%);
    transition: transform var(--duration-base) ease;
    max-height: none;
  }
  [dir='rtl'] .nav {
    transform: translateX(105%);
  }
  .shell.drawer-open .nav {
    transform: translateX(0);
  }
  .scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(20, 38, 43, 0.45);
  }
  .main {
    padding: 1.25rem 1.1rem 2rem;
  }
  .signout-top {
    border-color: var(--color-border) !important;
    color: var(--color-text) !important;
    background: var(--color-surface) !important;
    margin: 0 !important;
  }
}
</style>
