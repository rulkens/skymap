/**
 * Dev only: when `site:shots` adds or removes a picture file, re-run the module that lists them. Astro's SSR
 * keeps `shotSources.ts`'s eager `import.meta.glob` result from the first render, so a new width read as
 * missing ("No avif at 3840px …") and the page failed until the file was saved again. A shoot writes dozens
 * of files, so the reload waits for a quiet moment.
 */
import { join } from 'node:path';

import type { Plugin } from 'vite';

const QUIET_MS = 400;

export function shotFilesReload(srcDir: string): Plugin {
  const shots = join(srcDir, 'assets/shots/');
  const lister = join(srcDir, 'utils/shotSources.ts');
  return {
    name: 'shot-files-reload',
    apply: 'serve',
    configureServer(server) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onFile = (file: string) => {
        if (!file.startsWith(shots) || !/\.(avif|webp)$/.test(file)) return;
        clearTimeout(timer);
        // The same event a save of the lister raises: Vite drops it and what imports it, then reloads the page.
        timer = setTimeout(() => server.watcher.emit('change', lister), QUIET_MS);
      };
      server.watcher.on('add', onFile);
      server.watcher.on('unlink', onFile);
    },
  };
}
