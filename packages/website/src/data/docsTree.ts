import type { DocsGroup } from '../@types/DocsGroup';
import type { DocsRow } from '../@types/DocsRow';
import { DATA_PAGES } from './dataPages';

const DATA_PAGE_JOB =
  'Which published record is this source, under which licence may it be used, and which switch in the app shows it?';

/**
 * Every page the docs have or will have, in sidebar order: the one list behind
 * the sidebar, the docs index, previous and next, and the link check's planned
 * pages (tools/site/checkSiteLinks.ts). A `live` row has a file at
 * `src/content/docs/<path under /docs/>.mdx`, and that file's front matter
 * holds the page's title and job; tests/packages/website/docsTree.test.ts
 * holds the two together. A row names its own title and job only where no text
 * exists: Glossary, Credits, All sources and the data sources' pages, which
 * are made from data. Order, group and family are written here and nowhere
 * else (src/utils/loadDocsTree.ts joins the titles back on). Paths are the
 * published ones from the taste research (section 4.2), so a few sit outside
 * their group's folder. Still to be added: the topic pages of Science and Rendering.
 */
export const DOCS_TREE: readonly DocsGroup<DocsRow>[] = [
  {
    name: 'Start',
    purpose: 'A first flight, what the scene holds, and whether the app runs on your machine.',
    up: '/',
    pages: [
      { path: '/docs/start/first-flight/', status: 'live' },
      { path: '/docs/start/scene/', status: 'live' },
      {
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
      { path: '/docs/guide/moving/', status: 'live' },
      { path: '/docs/guide/finding/', status: 'live' },
      { path: '/docs/guide/time/', status: 'live' },
      { path: '/docs/guide/tours/', status: 'live' },
      { path: '/docs/guide/sharing/', status: 'live' },
      { path: '/docs/guide/info-cards/', status: 'live' },
      { path: '/docs/guide/settings/', status: 'live' },
      {
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
      { path: '/docs/reference/controls/', status: 'live' },
      { path: '/docs/reference/url-parameters/', status: 'live' },
      { path: '/docs/reference/settings/', status: 'live' },
      { path: '/docs/reference/objects/', status: 'live' },
      {
        title: 'Glossary',
        path: '/docs/reference/glossary/',
        status: 'live',
        job: 'What does this word mean in Skymap, and where is it explained further?',
      },
    ],
  },
  {
    name: 'Data',
    up: '/science/',
    pages: [
      {
        title: 'All sources at a glance',
        path: '/docs/data/',
        status: 'live',
        job: 'Which sources does Skymap use, and what may I do with each?',
      },
      { path: '/docs/data/pipeline/', status: 'live' },
      ...DATA_PAGES.map((page) => ({
        title: page.title,
        path: page.path,
        status: 'live' as const,
        family: page.family.name,
        job: DATA_PAGE_JOB,
      })),
    ],
  },
  {
    name: 'Science',
    up: '/science/',
    pages: [
      { path: '/docs/science/', status: 'live' },
      { path: '/docs/simplifications/', status: 'live' },
    ],
  },
  {
    name: 'Rendering',
    up: '/science/',
    pages: [
      { path: '/docs/rendering/', status: 'live' },
      { path: '/docs/rendering/techniques/', status: 'live' },
      { path: '/docs/rendering/precision/', status: 'live' },
      { path: '/docs/rendering/performance/', status: 'live' },
    ],
  },
  {
    name: 'Project',
    up: '/about/',
    pages: [
      { path: '/docs/roadmap/', status: 'live' },
      {
        title: 'Credits',
        path: '/docs/credits/',
        status: 'live',
        up: '/domes/',
        job: 'Who made what Skymap shows, what credit do they ask for, and how may I use it?',
      },
      { path: '/docs/cite/', status: 'live', up: '/science/' },
      {
        path: '/docs/developers/workbenches/',
        status: 'live',
      },
      {
        path: '/docs/developers/cli/',
        status: 'live',
      },
      {
        path: '/docs/developers/debug/',
        status: 'live',
      },
    ],
  },
];
