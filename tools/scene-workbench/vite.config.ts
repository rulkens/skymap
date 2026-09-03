/**
 * Scene Workbench — Vite dev server config. A sibling dev tool: own port
 * (`../utils/io/devPorts.ts`), own `root`, own `publicDir` → the repo's
 * shared `public/`.
 *
 * `weslToml` is EXPLICIT: cwd stays at the repo root (the RUNTIME's own
 * toml) under `npm run scene-workbench` — omit it and it links there instead.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';

import { DEV_PORTS } from '../utils/io/devPorts.ts';

export default defineConfig({
  root: resolve(import.meta.dirname),
  // envDir at repo root is load-bearing — without it dataUrl() falls back to same-origin /data/.
  publicDir: resolve(import.meta.dirname, '../../public'),
  envDir: resolve(import.meta.dirname, '../../'),
  server: { port: DEV_PORTS.sceneWorkbench },
  plugins: [
    viteWesl({
      extensions: [staticBuildExtension],
      weslToml: resolve(import.meta.dirname, 'wesl.toml'),
    }),
    react(),
  ],
});
