import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { i18n } from './i18n';

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
          meta: { titleKey: 'home.welcome' },
        },
        {
          path: 'grants',
          name: 'grants',
          component: () => import('./views/GrantsView.vue'),
          meta: { titleKey: 'grants.title' },
        },
        {
          path: 'grants/:id',
          name: 'grant-detail',
          component: () => import('./views/GrantDetailView.vue'),
          meta: { titleKey: 'grants.title' },
        },
        {
          path: 'reports',
          name: 'reports',
          component: () => import('./views/ReportsView.vue'),
          meta: { titleKey: 'reports.title' },
        },
        {
          path: 'finance',
          name: 'finance',
          component: () => import('./views/FinanceView.vue'),
          meta: { titleKey: 'finance.title' },
        },
        {
          path: 'employees',
          name: 'employees',
          component: () => import('./views/EmployeesView.vue'),
          meta: { titleKey: 'workforce.employees' },
        },
        {
          path: 'leave',
          name: 'leave',
          component: () => import('./views/LeaveView.vue'),
          meta: { titleKey: 'workforce.leave' },
        },
        {
          path: 'payroll',
          name: 'payroll',
          component: () => import('./views/PayrollView.vue'),
          meta: { titleKey: 'workforce.payroll' },
        },
        {
          path: 'field',
          name: 'field',
          component: () => import('./views/FieldView.vue'),
          meta: { titleKey: 'field.title' },
        },
        {
          path: 'training',
          name: 'training',
          component: () => import('./views/TrainingView.vue'),
          meta: { titleKey: 'training.title' },
        },
        {
          path: 'notifications',
          name: 'notifications',
          component: () => import('./views/NotificationsView.vue'),
          meta: { titleKey: 'notifications.title' },
        },
        {
          path: 'intelligence',
          name: 'intelligence',
          component: () => import('./views/IntelligenceView.vue'),
          meta: { titleKey: 'intelligence.title' },
        },
        {
          path: 'ai',
          name: 'ai',
          component: () => import('./views/AiInsightsView.vue'),
          meta: { titleKey: 'ai.title' },
        },
        {
          path: 'compliance',
          name: 'compliance',
          component: () => import('./views/ComplianceView.vue'),
          meta: { titleKey: 'compliance.title' },
        },
        {
          path: 'settings/webhooks',
          name: 'webhooks',
          component: () => import('./views/WebhooksView.vue'),
          meta: { titleKey: 'webhooks.title' },
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
  return true;
});

router.afterEach((to) => {
  const key = typeof to.meta.titleKey === 'string' ? to.meta.titleKey : 'app.name';
  const page = i18n.global.t(key);
  document.title = `${page} · ${i18n.global.t('app.shortName')}`;
});
