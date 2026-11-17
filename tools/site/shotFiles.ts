/**
 * The site's shot files as `virtual:shot-files`: one listing of the shots folder, keyed without the hash
 * (utils/shotFileIndex.ts), for `shotSources.ts` on the server and in the islands that bundle it. Dev's publicDir is
 * the repo's `public/` (astro.config.mjs), so dev serves `<base>shots/` from the folder itself, and when `site:shots`
 * adds or removes a file it reloads the listing once the writes go quiet: a shoot writes dozens.
 */
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, extname, join, sep } from 'node:path';

import type { Plugin } from 'vite';

import { shotFileIndex } from './utils/shotFileIndex';

const ID = 'virtual:shot-files';
const RESOLVED_ID = `\0${ID}`;
const QUIET_MS = 400;

export function shotFiles(dir: string, base: string): Plugin {
  return {
    name: 'shot-files',
    resolveId: (id) => (id === ID ? RESOLVED_ID : undefined),
    load: (id) =>
      id === RESOLVED_ID
        ? `export default ${JSON.stringify(shotFileIndex(readdirSync(dir)))};`
        : undefined,
    configureServer(server) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onFile = (file: string) => {
        if (!file.startsWith(dir + sep)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          for (const environment of Object.values(server.environments)) {
            const listing = environment.moduleGraph.getModuleById(RESOLVED_ID);
            if (listing) void environment.reloadModule(listing);
          }
        }, QUIET_MS);
      };
      server.watcher.on('add', onFile);
      server.watcher.on('unlink', onFile);
      // Post-hook + unshift, as astro.config.mjs's rootStatics: first in line, before Vite strips the base.
      return () => {
        server.middlewares.stack.unshift({
          route: `${base}shots`,
          handle: (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const file = join(dir, basename(decodeURIComponent((req.url ?? '').split('?')[0]!)));
            if (!/\.(avif|webp)$/.test(file) || !existsSync(file)) return next();
            res.setHeader('Content-Type', `image/${extname(file).slice(1)}`);
            createReadStream(file).pipe(res);
          },
        });
      };
    },
  };
}
