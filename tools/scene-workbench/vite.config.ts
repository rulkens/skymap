/**
 * Scene Workbench — Vite dev server config.
 *
 * A sibling dev tool (like tools/flow-workbench, tools/mcpm-workbench): its
 * own port (`../utils/io/devPorts.ts`), own `root`, own `publicDir` pointing
 * at the repo's shared `public/`. Local-only — no deploy target, so unlike
 * those tools there is no build mode to switch on.
 *
 * `weslToml` is passed EXPLICITLY: the plugin otherwise reads
 * `<process.cwd()>/wesl.toml`, and `npm run scene-workbench` keeps cwd at the
 * repo root, where the RUNTIME's toml lives — omit the path and it silently
 * links against the wrong shader set and never finds this tool's `.wesl` files.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';

import { DEV_PORTS } from '../utils/io/devPorts.ts';

export default defineConfig({
  root: resolve(import.meta.dirname),
  // envDir at the repo root is load-bearing: with `root:` here Vite looks
  // for env files locally and dataUrl() silently falls back to same-origin
  // /data/.
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
