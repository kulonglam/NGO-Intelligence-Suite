import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useTenantStore } from './stores/tenant';
import { i18n } from './i18n';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    titleKey?: string;
    breadcrumbKey?: string;
    parent?: string;
    parentLabelKey?: string;
    /** Any-of permission list (SDD §19.9 role gate). */
    permissions?: string[];
    /** Tenant module id that must be enabled. */
    module?: string;
    /** Feature flag that must be enabled. */
    featureFlag?: string;
    /** Skip tenant active check (guard destinations). */
    skipTenantGuard?: boolean;
  }
}

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk/i.test(
    msg,
  );
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: { public: true, titleKey: 'login.heading' },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('./views/AuthCallbackView.vue'),
      meta: { public: true, titleKey: 'login.heading' },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('./views/AuthCallbackView.vue'),
      meta: { public: true, titleKey: 'login.oidcCompleting' },
    },
    {
      path: '/',
      component: () => import('./layouts/AppShell.vue'),
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('./views/HomeView.vue'),
          meta: { titleKey: 'home.welcome', breadcrumbKey: 'app.overview' },
        },
        {
          path: 'forbidden',
          name: 'forbidden',
          component: () => import('./views/ForbiddenView.vue'),
          meta: {
            titleKey: 'guards.forbiddenTitle',
            skipTenantGuard: true,
          },
        },
        {
          path: 'tenant-suspended',
          name: 'tenant-suspended',
          component: () => import('./views/TenantSuspendedView.vue'),
          meta: {
            titleKey: 'guards.suspendedTitle',
            skipTenantGuard: true,
          },
        },
        {
          path: 'module-unavailable',
          name: 'module-unavailable',
          component: () => import('./views/ModuleUnavailableView.vue'),
          meta: {
            titleKey: 'guards.moduleTitle',
            skipTenantGuard: true,
          },
        },
        {
          path: 'offline-unavailable',
          name: 'offline-unavailable',
          component: () => import('./views/OfflineUnavailableView.vue'),
          meta: {
            titleKey: 'guards.offlineTitle',
            skipTenantGuard: true,
          },
        },
        {
          path: 'grants',
          name: 'grants',
          component: () => import('./views/GrantsView.vue'),
          meta: {
            titleKey: 'grants.title',
            module: 'grants',
            permissions: ['grant:award:list', 'grant:award:read'],
          },
        },
        {
          path: 'grants/:id',
          name: 'grant-detail',
          component: () => import('./views/GrantDetailView.vue'),
          meta: {
            titleKey: 'grants.title',
            breadcrumbKey: 'grants.detail.awards',
            parent: '/grants',
            parentLabelKey: 'grants.title',
            module: 'grants',
            permissions: ['grant:award:list', 'grant:award:read'],
          },
        },
        {
          path: 'reports',
          name: 'reports',
          component: () => import('./views/ReportsView.vue'),
          meta: {
            titleKey: 'reports.title',
            module: 'reports',
            permissions: ['grant:report:read', 'reporting:dashboard:read'],
          },
        },
        {
          path: 'finance',
          name: 'finance',
          component: () => import('./views/FinanceView.vue'),
          meta: {
            titleKey: 'finance.title',
            module: 'finance',
            permissions: ['grant:expenditure:read', 'grant:budget:read'],
          },
        },
        {
          path: 'employees',
          name: 'employees',
          component: () => import('./views/EmployeesView.vue'),
          meta: {
            titleKey: 'workforce.employees',
            module: 'hr',
            permissions: ['hr:employee:list', 'hr:employee:read'],
          },
        },
        {
          path: 'leave',
          name: 'leave',
          component: () => import('./views/LeaveView.vue'),
          meta: {
            titleKey: 'workforce.leave',
            module: 'hr',
            permissions: ['hr:leave:read', 'hr:leave:request'],
          },
        },
        {
          path: 'payroll',
          name: 'payroll',
          component: () => import('./views/PayrollView.vue'),
          meta: {
            titleKey: 'workforce.payroll',
            module: 'payroll',
            permissions: ['payroll:run:read'],
          },
        },
        {
          path: 'field',
          name: 'field',
          component: () => import('./views/FieldView.vue'),
          meta: {
            titleKey: 'field.title',
            module: 'field',
            permissions: ['field:form:read', 'field:submission:create'],
          },
        },
        {
          path: 'training',
          name: 'training',
          component: () => import('./views/TrainingView.vue'),
          meta: {
            titleKey: 'training.title',
            module: 'lms',
            permissions: ['lms:course:read', 'lms:enrollment:read_own'],
          },
        },
        {
          path: 'notifications',
          name: 'notifications',
          component: () => import('./views/NotificationsView.vue'),
          meta: {
            titleKey: 'notifications.title',
            module: 'notifications',
            permissions: ['notification:delivery:read', 'notification:send'],
          },
        },
        {
          path: 'intelligence',
          name: 'intelligence',
          component: () => import('./views/IntelligenceView.vue'),
          meta: {
            titleKey: 'intelligence.title',
            module: 'intelligence',
            permissions: ['reporting:dashboard:read', 'grant:report:read'],
          },
        },
        {
          path: 'ai',
          name: 'ai',
          component: () => import('./views/AiInsightsView.vue'),
          meta: {
            titleKey: 'ai.title',
            module: 'ai',
            featureFlag: 'ai_insights',
            permissions: ['ai:insight:read', 'ai:insight:request'],
          },
        },
        {
          path: 'compliance',
          name: 'compliance',
          component: () => import('./views/ComplianceView.vue'),
          meta: {
            titleKey: 'compliance.title',
            module: 'compliance',
            permissions: ['grant:compliance:read', 'grant:iati:publish'],
          },
        },
        {
          path: 'settings/webhooks',
          name: 'webhooks',
          component: () => import('./views/WebhooksView.vue'),
          meta: {
            titleKey: 'webhooks.title',
            module: 'integrations',
            featureFlag: 'webhooks',
            permissions: ['webhook:subscription:manage', 'webhook:delivery:read'],
          },
        },
        {
          path: 'design-system',
          name: 'design-system',
          component: () => import('./views/DesignSystemView.vue'),
          meta: {
            titleKey: 'designSystem.title',
            breadcrumbKey: 'nav.designSystem',
          },
        },
      ],
    },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const tenant = useTenantStore();

  if (!to.meta.public && !auth.token) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && auth.token) {
    return { name: 'home' };
  }
  if (to.meta.public) return true;

  if (!tenant.bootstrapLoaded) {
    await tenant.loadBootstrap();
  }

  if (!to.meta.skipTenantGuard && !tenant.isActive) {
    if (to.name !== 'tenant-suspended') return { name: 'tenant-suspended' };
    return true;
  }

  if (to.meta.module && !tenant.moduleEnabled(to.meta.module)) {
    return {
      name: 'module-unavailable',
      query: { module: to.meta.module },
    };
  }

  const perms = to.meta.permissions;
  if (perms?.length && !auth.canAny(perms)) {
    return {
      name: 'forbidden',
      query: { permission: perms[0] },
    };
  }

  if (to.meta.featureFlag && !tenant.featureEnabled(to.meta.featureFlag)) {
    return {
      name: 'module-unavailable',
      query: { flag: to.meta.featureFlag },
    };
  }

  return true;
});

router.onError((err, to) => {
  if (isChunkLoadError(err) && typeof navigator !== 'undefined' && !navigator.onLine) {
    void router.push({
      name: 'offline-unavailable',
      query: { from: to.fullPath },
    });
  }
});

router.afterEach((to) => {
  const key = typeof to.meta.titleKey === 'string' ? to.meta.titleKey : 'app.name';
  const page = i18n.global.t(key);
  document.title = `${page} · ${i18n.global.t('app.shortName')}`;
});
