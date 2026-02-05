import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Alertsify Documentation',
  tagline: 'Enterprise Options Trading Platform - Technical Documentation',
  favicon: 'img/favicon.ico',

  future: { v4: true },
  url: 'https://docs.alertsify.com',
  baseUrl: '/',
  organizationName: 'flowgeniusmz',
  projectName: 'alertsify-docs',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  markdown: { mermaid: true },
  themes: ['@docusaurus/theme-mermaid'],

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          showLastUpdateTime: true,
          breadcrumbs: true,
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        docsRouteBasePath: '/',
      },
    ],
  ],

  themeConfig: {
    image: 'img/alertsify-social-card.png',
    colorMode: { defaultMode: 'dark', respectPrefersColorScheme: true },
    docs: { sidebar: { hideable: true, autoCollapseCategories: true } },
    navbar: {
      title: 'Alertsify Docs',
      logo: { alt: 'Alertsify Logo', src: 'img/logo.svg' },
      items: [
        { type: 'docSidebar', sidebarId: 'gettingStartedSidebar', position: 'left', label: 'Getting Started' },
        { type: 'docSidebar', sidebarId: 'architectureSidebar', position: 'left', label: 'Architecture' },
        { type: 'docSidebar', sidebarId: 'dashboardSidebar', position: 'left', label: 'Dashboard' },
        { type: 'docSidebar', sidebarId: 'flowsSidebar', position: 'left', label: 'Flows' },
        { type: 'docSidebar', sidebarId: 'apiSidebar', position: 'left', label: 'API Reference' },
        { type: 'docSidebar', sidebarId: 'databaseSidebar', position: 'left', label: 'Database' },
        { type: 'docSidebar', sidebarId: 'integrationsSidebar', position: 'left', label: 'Integrations' },
        { href: 'https://github.com/flowgeniusmz/alertsify_v3.0', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        { title: 'Documentation', items: [{ label: 'Getting Started', to: '/' }, { label: 'Architecture', to: '/architecture/overview' }, { label: 'Dashboard', to: '/dashboard' }] },
        { title: 'Reference', items: [{ label: 'API Reference', to: '/api/internal-routes' }, { label: 'Database', to: '/database/schema' }] },
        { title: 'Resources', items: [{ label: 'Integrations', to: '/integrations/overview' }, { label: 'Trading Flows', to: '/flows/bto-execution' }] },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Alertsify. All rights reserved.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'sql', 'typescript', 'json'],
    },
    mermaid: { theme: { light: 'neutral', dark: 'dark' } },
  } satisfies Preset.ThemeConfig,
};

export default config;
