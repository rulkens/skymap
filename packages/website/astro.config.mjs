/**
 * Website — Astro config. Preview: mounted as a subpath of the main shell like
 * the dev-tool pages (docs/DEPLOY.md), so base and outDir come from the same
 * registries and `dist/home/` and `/home/` cannot drift apart. `SITE_MODE`
 * (src/data/site.ts) moves base and outDir to the root and turns on the
 * sitemap and robots.txt, all from one value.
 *
 * `base` applies to dev too, so a link behaves identically in both. Shared
 * statics (`/fonts`, `/favicon.svg`, `/images/featured`) are root files of
 * the main shell and pages reference them root-absolute; the build ships none
 * of them. In dev Vite serves publicDir under `base` only, so `devRootStatics`
 * mounts the repo's `public/` and rewrites root requests for its files into
 * that mount (Astro 7 still has no supported way to do this, and the
 * middleware depends on Astro's own ordering, so check `npm run site` after
 * an Astro upgrade).
 *
 * `envDir` is the repo root so `VITE_DATA_BASE_URL` (committed in `.env.production`)
 * reaches the pages the same way it reaches the app.
 */
import { defineConfig } from 'astro/config';
import { statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DEV_PORTS } from '../../tools/utils/io/devPorts.ts';
import { distDir } from '../../tools/utils/io/distDir.ts';
import { toolPages } from '../../tools/utils/io/toolPages.ts';
import { BASE, INDEXABLE } from './src/data/site.ts';
import { robotsTxt } from './src/utils/robotsTxt.ts';
import { sitemapXml } from './src/utils/sitemapXml.ts';

const site = 'https://skymap.rulkens.com';
const publicDir = resolve(import.meta.dirname, '../../public');

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

const rootStatics = {
  name: 'root-statics',
  configureServer(server) {
    // Post-hook + unshift: Astro's base guard is itself unshifted to the front
    // and would 404 a root request before any ordinary middleware saw it.
    return () => {
      server.middlewares.stack.unshift({
        route: '',
        handle: (req, _res, next) => {
          const path = (req.url ?? '').split('?')[0];
          if (!path.startsWith(BASE) && isFile(join(publicDir, path))) {
            req.url = BASE.slice(0, -1) + req.url;
          }
          next();
        },
      });
    };
  },
};

const devRootStatics = {
  name: 'dev-root-statics',
  hooks: {
    'astro:config:setup': ({ command, updateConfig }) => {
      if (command === 'dev')
        updateConfig({
          publicDir: pathToFileURL(`${publicDir}/`),
          vite: { plugins: [rootStatics] },
        });
    },
  },
};

const crawlFiles = {
  name: 'crawl-files',
  hooks: {
    'astro:build:done': ({ dir, pages }) => {
      if (!INDEXABLE) return;
      const urls = pages
        .map((p) => new URL(p.pathname, site + BASE).href)
        .filter((u) => !u.endsWith('/404/'));
      writeFileSync(join(fileURLToPath(dir), 'sitemap.xml'), sitemapXml(urls));
      writeFileSync(join(fileURLToPath(dir), 'robots.txt'), robotsTxt(`${site}/sitemap.xml`));
    },
  },
};

export default defineConfig({
  site,
  base: BASE,
  outDir: INDEXABLE ? distDir : resolve(distDir, toolPages.website),
  trailingSlash: 'always',
  build: { format: 'directory' },
  server: { port: DEV_PORTS.website },
  integrations: [devRootStatics, crawlFiles],
  vite: { envDir: resolve(import.meta.dirname, '../..') },
});
