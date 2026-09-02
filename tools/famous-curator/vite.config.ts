/**
 * Famous Galaxy Curator — Vite dev server config.
 *
 * Separate from the root `vite.config.ts` because the curator is a
 * sibling tool, not part of the skymap runtime bundle: it has its own
 * port (see `../utils/io/devPorts.ts`), its own root (this
 * `tools/famous-curator/` directory rather than the repo root), and its
 * own React entry (`ui/main.tsx`).
 *
 * The `configureServer`-based API plugin lives in `./plugin/apiPlugin.ts`
 * (added in Task 4).  We import + register it here so the API and the
 * dev server share a single process — no separate Express + proxy setup.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { apiPlugin } from './plugin/apiPlugin.ts';
import { restartOnPluginChange } from './plugin/restartOnPluginChange.ts';
import { DEV_PORTS } from '../utils/io/devPorts.ts';

export default defineConfig({
  root: resolve(import.meta.dirname, 'ui'),
  // Vite resolves `index.html` from `root`; explicit publicDir keeps
  // the curator from pulling in the main app's `public/` (we don't
  // want the runtime atlas + bins served from the curator).
  publicDir: false,
  server: { port: DEV_PORTS.famousCurator },
  // restartOnPluginChange must come BEFORE apiPlugin so it has a chance
  // to register its watcher before any apiPlugin file is imported.
  plugins: [restartOnPluginChange(), react(), apiPlugin()],
});
