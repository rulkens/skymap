/**
 * Website — Astro config. Mounted as a subpath of the main shell like the
 * dev-tool pages (docs/DEPLOY.md): base/outDir/port come from the same
 * registries, so `dist/home/` and `/home/` cannot drift apart.
 *
 * `base` applies to dev too, so a link behaves identically in both. Shared
 * statics (`/fonts`, `/favicon.svg`, `/images/featured`) are root files of
 * the main shell and pages reference them root-absolute. Production: the
 * shell ships them, so the build has no publicDir. Dev: Vite serves publicDir
 * under `base` only, so `rootStatics` rewrites root requests for files in the
 * repo's `public/` into that mount.
 */
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { DEV_PORTS } from '../../tools/utils/io/devPorts.ts';
import { distDir } from '../../tools/utils/io/distDir.ts';
import { toolPages } from '../../tools/utils/io/toolPages.ts';

const isBuild = process.argv.includes('build');
const base = `/${toolPages.website}/`;
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
          if (!path.startsWith(base) && isFile(join(publicDir, path))) {
            req.url = base.slice(0, -1) + req.url;
          }
          next();
        },
      });
    };
  },
};

export default defineConfig({
  site: 'https://skymap.rulkens.com',
  base,
  outDir: resolve(distDir, toolPages.website),
  ...(isBuild ? {} : { publicDir }),
  trailingSlash: 'always',
  build: { format: 'directory' },
  server: { port: DEV_PORTS.website },
  integrations: [mdx()],
  vite: { plugins: [rootStatics] },
});
