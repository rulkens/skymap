import { toolPages } from '../../../../tools/utils/io/toolPages';

export type SiteMode = 'preview' | 'live';

/**
 * The one switch between the unindexed preview under `/home/` and the live site
 * at the root. It decides the robots meta, the base path and output folder, the
 * canonical origin path, and whether a sitemap and robots.txt are written;
 * nothing else reads the environment, so the swap is one value and a half-flip
 * is one test (tests/packages/website/siteMode.test.ts). `live` writes the site
 * at the root of `dist/`: use it only once the app has moved to `/app`.
 */
export const SITE_MODE: SiteMode = process.env.SKYMAP_SITE_MODE === 'live' ? 'live' : 'preview';
export const INDEXABLE = SITE_MODE === 'live';
export const BASE = INDEXABLE ? '/' : `/${toolPages.website}/`;
