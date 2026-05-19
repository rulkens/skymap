/**
 * restartOnPluginChange — vite plugin that watches the curator's plugin
 * directory and restarts the dev server when any plugin/route file
 * changes.
 *
 * Why: vite's HMR doesn't refresh the apiPlugin's route handlers —
 * they're loaded once at server boot via the vite.config.ts import
 * graph and stay in memory afterwards.  Without this plugin, API code
 * changes silently do nothing until the maintainer ctrl-Cs and reruns
 * `npm run curate-famous`.
 *
 * Vite's watcher is chokidar.  We tell it to also watch the plugin
 * tree (which lives outside the vite `root`, so it isn't auto-watched)
 * and call `server.restart()` on every change.  Restart re-imports
 * vite.config.ts and rebuilds the plugin pipeline — including the
 * fresh apiPlugin code.
 */
import type { Plugin } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function restartOnPluginChange(): Plugin {
  // Resolve the plugin directory absolutely so chokidar's match is
  // unambiguous regardless of where vite is invoked from.
  const here = dirname(fileURLToPath(import.meta.url));
  return {
    name: 'famous-curator-restart-on-plugin-change',
    configureServer(server) {
      server.watcher.add(`${here}/**/*.ts`);
      server.watcher.on('change', (path) => {
        if (!path.startsWith(here)) return;
        server.config.logger.info(
          `\n[curator] plugin change: ${resolve(path)} → restarting server\n`,
          { clear: false, timestamp: true },
        );
        // `restart(true)` forces a full restart instead of partial reload.
        void server.restart(true);
      });
    },
  };
}
