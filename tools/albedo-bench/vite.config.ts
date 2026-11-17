/**
 * Albedo Bench — Vite dev server config.
 *
 * A sibling dev tool (like `tools/famous-curator`), not part of the skymap
 * runtime bundle; its API plugin shares the dev server's process.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { apiPlugin } from './plugin/apiPlugin.ts';
import { restartOnPluginChange } from '../utils/vite/restartOnPluginChange.ts';
import { DEV_PORTS } from '../utils/io/devPorts.ts';

export default defineConfig({
  root: resolve(import.meta.dirname, 'ui'),
  // Vite resolves index.html from `root`; explicit publicDir keeps the bench
  // from pulling in the main app's public/ (no runtime atlas/bins to serve).
  publicDir: false,
  server: { port: DEV_PORTS.albedoBench },
  // restartOnPluginChange must come BEFORE apiPlugin so it has a chance to
  // register its watcher before any apiPlugin file is imported.
  plugins: [
    restartOnPluginChange(resolve(import.meta.dirname, 'plugin'), 'albedo-bench'),
    react(),
    apiPlugin(),
  ],
});
