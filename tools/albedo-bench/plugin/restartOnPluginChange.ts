/**
 * restartOnPluginChange — vite plugin that watches the bench's plugin
 * directory and restarts the dev server when any plugin/route file changes.
 *
 * Why: vite's HMR doesn't refresh apiPlugin's route handlers — they're
 * loaded once at server boot via the vite.config.ts import graph and stay in
 * memory afterwards. Without this, a route edit silently does nothing until
 * the maintainer ctrl-Cs and reruns `npm run albedo-bench`.
 *
 * Copied from `tools/famous-curator/plugin/restartOnPluginChange.ts` (same
 * per-tool idiom, no shared runtime state to couple two sibling tools over).
 */
import type { Plugin } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function restartOnPluginChange(): Plugin {
  // Resolve the plugin directory absolutely so chokidar's match is
  // unambiguous regardless of where vite is invoked from.
  const here = dirname(fileURLToPath(import.meta.url));
  return {
    name: 'albedo-bench-restart-on-plugin-change',
    configureServer(server) {
      server.watcher.add(`${here}/**/*.ts`);
      server.watcher.on('change', (path) => {
        if (!path.startsWith(here)) return;
        server.config.logger.info(
          `\n[albedo-bench] plugin change: ${resolve(path)} → restarting server\n`,
          { clear: false, timestamp: true },
        );
        void server.restart(true);
      });
    },
  };
}
