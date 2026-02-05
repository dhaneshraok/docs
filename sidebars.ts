import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  gettingStartedSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/index',
        'getting-started/installation',
        'getting-started/project-structure',
        'getting-started/tech-stack',
      ],
    },
  ],
  architectureSidebar: [
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        'architecture/frontend',
        'architecture/backend',
        'architecture/state-management',
        'architecture/caching',
      ],
    },
  ],
  flowsSidebar: [
    {
      type: 'category',
      label: 'Trading Flows',
      items: [
        'flows/bto-execution',
        'flows/stc-execution',
        'flows/copy-trading',
        'flows/order-sync',
        'flows/notifications',
      ],
    },
  ],
  apiSidebar: [
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/internal-routes',
        'api/server-actions',
        'api/snaptrade',
        'api/getstream',
        'api/discord',
      ],
    },
  ],
  databaseSidebar: [
    {
      type: 'category',
      label: 'Database',
      items: [
        'database/schema',
        'database/triggers',
        'database/views',
      ],
    },
  ],
  integrationsSidebar: [
    {
      type: 'category',
      label: 'Integrations',
      items: [
        'integrations/overview',
      ],
    },
  ],
  dashboardSidebar: [
    {
      type: 'category',
      label: 'Dashboard Module',
      items: [
        'dashboard/index',
        'dashboard/architecture',
        'dashboard/data-models',
        'dashboard/database-views',
        'dashboard/api-endpoints',
        'dashboard/components',
        'dashboard/hooks-state',
      ],
    },
  ],
};

export default sidebars;
