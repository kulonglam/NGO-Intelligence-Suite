import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useToastStore } from './stores/toast';
import { i18n } from './i18n';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    titleKey?: string;
    breadcrumbKey?: string;
    parent?: string;
    parentLabelKey?: string;
    permissions?: string[];
  }
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
          path: 'grants',
          name: 'grants',
          component: () => import('./views/GrantsView.vue'),
          meta: {
            titleKey: 'grants.title',
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
            permissions: ['grant:award:list', 'grant:award:read'],
          },
        },
        {
          path: 'reports',
          name: 'reports',
          component: () => import('./views/ReportsView.vue'),
          meta: {
            titleKey: 'reports.title',
            permissions: ['grant:report:read', 'reporting:dashboard:read'],
          },
        },
        {
          path: 'finance',
          name: 'finance',
          component: () => import('./views/FinanceView.vue'),
          meta: {
            titleKey: 'finance.title',
            permissions: ['grant:expenditure:read', 'grant:budget:read'],
          },
        },
        {
          path: 'employees',
          name: 'employees',
          component: () => import('./views/EmployeesView.vue'),
          meta: {
            titleKey: 'workforce.employees',
            permissions: ['hr:employee:list', 'hr:employee:read'],
          },
        },
        {
          path: 'leave',
          name: 'leave',
          component: () => import('./views/LeaveView.vue'),
          meta: {
            titleKey: 'workforce.leave',
            permissions: ['hr:leave:read', 'hr:leave:request'],
          },
        },
        {
          path: 'payroll',
          name: 'payroll',
          component: () => import('./views/PayrollView.vue'),
          meta: {
            titleKey: 'workforce.payroll',
            permissions: ['payroll:run:read'],
          },
        },
        {
          path: 'field',
          name: 'field',
          component: () => import('./views/FieldView.vue'),
          meta: {
            titleKey: 'field.title',
            permissions: ['field:form:read', 'field:submission:create'],
          },
        },
        {
          path: 'training',
          name: 'training',
          component: () => import('./views/TrainingView.vue'),
          meta: {
            titleKey: 'training.title',
            permissions: ['lms:course:read', 'lms:enrollment:read_own'],
          },
        },
        {
          path: 'notifications',
          name: 'notifications',
          component: () => import('./views/NotificationsView.vue'),
          meta: {
            titleKey: 'notifications.title',
            permissions: ['notification:delivery:read', 'notification:send'],
          },
        },
        {
          path: 'intelligence',
          name: 'intelligence',
          component: () => import('./views/IntelligenceView.vue'),
          meta: {
            titleKey: 'intelligence.title',
            permissions: ['reporting:dashboard:read', 'grant:report:read'],
          },
        },
        {
          path: 'ai',
          name: 'ai',
          component: () => import('./views/AiInsightsView.vue'),
          meta: {
            titleKey: 'ai.title',
            permissions: ['ai:insight:read', 'ai:insight:request'],
          },
        },
        {
          path: 'compliance',
          name: 'compliance',
          component: () => import('./views/ComplianceView.vue'),
          meta: {
            titleKey: 'compliance.title',
            permissions: ['grant:compliance:read', 'grant:iati:publish'],
          },
        },
        {
          path: 'settings/webhooks',
          name: 'webhooks',
          component: () => import('./views/WebhooksView.vue'),
          meta: {
            titleKey: 'webhooks.title',
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

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!to.meta.public && !auth.token) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && auth.token) {
    return { name: 'home' };
  }
  const perms = to.meta.permissions;
  if (perms?.length && !auth.canAny(perms)) {
    const toast = useToastStore();
    toast.error(i18n.global.t('nav.forbidden'));
    return { name: 'home' };
  }
  return true;
});

router.afterEach((to) => {
  const key = typeof to.meta.titleKey === 'string' ? to.meta.titleKey : 'app.name';
  const page = i18n.global.t(key);
  document.title = `${page} · ${i18n.global.t('app.shortName')}`;
});
