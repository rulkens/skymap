/**
 * Albedo Bench — Vite dev server config.
 *
 * A sibling dev tool (like `tools/famous-curator`), not part of the skymap
 * runtime bundle: its own port (`../utils/io/devPorts.ts`), its own root
 * (this `tools/albedo-bench/` directory), and its own React entry
 * (`ui/main.tsx`). The `configureServer`-based API plugin lives in
 * `./plugin/apiPlugin.ts`, sharing one process with the dev server.
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
