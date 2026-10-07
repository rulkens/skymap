import type { DocsGroup } from '../@types/DocsGroup';
import { DATA_PAGES } from './dataPages';

/**
 * Every page the docs have or will have, in sidebar order: the one list behind
 * the sidebar, the docs index, previous and next, and the link check's planned
 * pages (tools/site/checkSiteLinks.ts). A `live` row has a file at
 * `src/content/docs/<path under /docs/>.mdx`; tests/packages/website/docsTree.test.ts
 * holds the two together. Paths are the published ones from the taste research
 * (section 4.2), so a few sit outside their group's folder. The data sources'
 * rows are not typed: they are the pages data/dataPages.ts makes from
 * ATTRIBUTIONS.md. Still to be added: the topic pages of Science and Rendering.
 */
export const DOCS_TREE: readonly DocsGroup[] = [
  {
    name: 'Start',
    purpose: 'A first flight, what the scene holds, and whether the app runs on your machine.',
    up: '/',
    pages: [
      { title: 'First flight', path: '/docs/start/first-flight/', status: 'live' },
      { title: 'What is in the scene', path: '/docs/start/scene/', status: 'live' },
      {
        title: 'Browser support and troubleshooting',
        path: '/docs/start/browsers/',
        status: 'live',
        up: '/classroom/',
      },
    ],
  },
  {
    name: 'Guide',
    purpose: 'Each thing the app does, one task to a page.',
    up: '/classroom/',
    pages: [
      { title: 'Moving around', path: '/docs/guide/moving/', status: 'live' },
      { title: 'Finding things', path: '/docs/guide/finding/', status: 'live' },
      { title: 'Time', path: '/docs/guide/time/', status: 'live' },
      { title: 'Tours and exhibits', path: '/docs/guide/tours/', status: 'live' },
      { title: 'Sharing a view', path: '/docs/guide/sharing/', status: 'live' },
      { title: 'Info cards', path: '/docs/guide/info-cards/', status: 'live' },
      { title: 'Settings guide', path: '/docs/guide/settings/', status: 'live' },
      {
        title: 'Screens, quality and domes',
        path: '/docs/guide/screens-and-domes/',
        status: 'live',
        up: '/domes/',
      },
    ],
  },
  {
    name: 'Reference',
    purpose: 'Every key, link parameter, setting and named object, in tables.',
    up: '/classroom/',
    pages: [
      { title: 'Controls', path: '/docs/reference/controls/', status: 'live' },
      { title: 'URL parameters', path: '/docs/reference/url-parameters/', status: 'live' },
      { title: 'All settings', path: '/docs/reference/settings/', status: 'live' },
      { title: 'Object catalogue', path: '/docs/reference/objects/', status: 'live' },
      { title: 'Glossary', path: '/docs/reference/glossary/', status: 'live' },
    ],
  },
  {
    name: 'Data',
    purpose: 'Every catalogue and image the map is built from, with its licence and where to check it.',
    up: '/science/',
    pages: [
      { title: 'All sources at a glance', path: '/docs/data/', status: 'live' },
      { title: 'From catalogue to pixels', path: '/docs/data/pipeline/', status: 'live' },
      ...DATA_PAGES.map((page) => ({
        title: page.title,
        path: page.path,
        status: 'live' as const,
        family: page.family.name,
      })),
    ],
  },
  {
    name: 'Science',
    purpose: 'What is measured, what is derived, what is modelled and what is drawn.',
    up: '/science/',
    pages: [
      { title: 'Measured, derived, modelled, drawn', path: '/docs/science/', status: 'live' },
      { title: 'Known simplifications', path: '/docs/simplifications/', status: 'live' },
    ],
  },
  {
    name: 'Rendering',
    purpose: 'How one frame is drawn, from catalogue rows to pixels.',
    up: '/science/',
    pages: [
      { title: 'The frame', path: '/docs/rendering/', status: 'live' },
      { title: 'Techniques', path: '/docs/rendering/techniques/', status: 'live' },
      { title: 'Precision across scales', path: '/docs/rendering/precision/', status: 'live' },
      { title: 'Performance', path: '/docs/rendering/performance/', status: 'live' },
    ],
  },
  {
    name: 'Project',
    purpose: 'Where the project is going, whom it credits and how to cite it.',
    up: '/about/',
    pages: [
      { title: 'Roadmap', path: '/docs/roadmap/', status: 'planned' },
      { title: 'Credits', path: '/docs/credits/', status: 'live', up: '/domes/' },
      { title: 'Cite', path: '/docs/cite/', status: 'live', up: '/science/' },
      {
        title: 'Developer workbenches',
        path: '/docs/developers/workbenches/',
        status: 'planned',
      },
      {
        title: 'Command-line tools',
        path: '/docs/developers/cli/',
        status: 'live',
      },
      {
        title: 'Debug panel and flags',
        path: '/docs/developers/debug/',
        status: 'planned',
      },
    ],
  },
];
