import type { PaletteItem } from '../components/layout/CommandPalette.vue';

export type NavItem = {
  to: string;
  labelKey: string;
  exact?: boolean;
  anyOf?: string[];
  module?: string;
  featureFlag?: string;
};

export type NavGroup = {
  id: string;
  labelKey: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    labelKey: 'nav.overview',
    items: [{ to: '/', labelKey: 'app.overview', exact: true }],
  },
  {
    id: 'programmes',
    labelKey: 'nav.programmes',
    items: [
      {
        to: '/grants',
        labelKey: 'app.grants',
        module: 'grants',
        anyOf: ['grant:award:list', 'grant:award:read'],
      },
      {
        to: '/finance',
        labelKey: 'app.finance',
        module: 'finance',
        anyOf: ['grant:expenditure:read', 'grant:budget:read'],
      },
      {
        to: '/reports',
        labelKey: 'app.reports',
        module: 'reports',
        anyOf: ['grant:report:read', 'reporting:dashboard:read'],
      },
    ],
  },
  {
    id: 'workforce',
    labelKey: 'nav.workforce',
    items: [
      {
        to: '/employees',
        labelKey: 'app.employees',
        module: 'hr',
        anyOf: ['hr:employee:list', 'hr:employee:read'],
      },
      {
        to: '/leave',
        labelKey: 'app.leave',
        module: 'hr',
        anyOf: ['hr:leave:read', 'hr:leave:request'],
      },
      {
        to: '/payroll',
        labelKey: 'app.payroll',
        module: 'payroll',
        anyOf: ['payroll:run:read'],
      },
      {
        to: '/training',
        labelKey: 'app.training',
        module: 'lms',
        anyOf: ['lms:course:read', 'lms:enrollment:read_own'],
      },
    ],
  },
  {
    id: 'field',
    labelKey: 'nav.field',
    items: [
      {
        to: '/field',
        labelKey: 'app.field',
        module: 'field',
        anyOf: ['field:form:read', 'field:submission:create'],
      },
    ],
  },
  {
    id: 'intelligence',
    labelKey: 'nav.intelligence',
    items: [
      {
        to: '/intelligence',
        labelKey: 'app.intelligence',
        module: 'intelligence',
        anyOf: ['reporting:dashboard:read', 'grant:report:read'],
      },
      {
        to: '/ai',
        labelKey: 'app.ai',
        module: 'ai',
        featureFlag: 'ai_insights',
        anyOf: ['ai:insight:read', 'ai:insight:request'],
      },
      {
        to: '/compliance',
        labelKey: 'app.compliance',
        module: 'compliance',
        anyOf: ['grant:compliance:read', 'grant:iati:publish'],
      },
    ],
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    items: [
      {
        to: '/notifications',
        labelKey: 'app.notifications',
        module: 'notifications',
        anyOf: ['notification:delivery:read', 'notification:send'],
      },
      {
        to: '/settings/webhooks',
        labelKey: 'app.webhooks',
        module: 'integrations',
        featureFlag: 'webhooks',
        anyOf: ['webhook:subscription:manage', 'webhook:delivery:read'],
      },
      { to: '/design-system', labelKey: 'nav.designSystem' },
    ],
  },
];

export function paletteItemsFromNav(): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      items.push({
        id: item.to,
        to: item.to,
        labelKey: item.labelKey,
        groupKey: g.labelKey,
        anyOf: item.anyOf,
        module: item.module,
        featureFlag: item.featureFlag,
      });
    }
  }
  return items;
}
