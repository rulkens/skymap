/** Vite's HMR never reloads `configureServer` route handlers — they're
 *  imported once at boot and stay in memory — so this plugin watches
 *  `pluginDir` and forces a full server restart on any change there. */
import type { Plugin } from 'vite';
import { resolve } from 'node:path';

export function restartOnPluginChange(pluginDir: string, label: string): Plugin {
  return {
    name: `${label}-restart-on-plugin-change`,
    configureServer(server) {
      server.watcher.add(`${pluginDir}/**/*.ts`);
      server.watcher.on('change', (path) => {
        if (!path.startsWith(pluginDir)) return;
        server.config.logger.info(
          `\n[${label}] plugin change: ${resolve(path)} → restarting server\n`,
          { clear: false, timestamp: true },
        );
        void server.restart(true);
      });
    },
  };
}
