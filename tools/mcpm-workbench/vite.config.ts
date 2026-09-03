/**
 * MCPM Workbench — Vite dev server config.
 *
 * A sibling dev tool (like tools/flow-workbench, tools/galaxy-renderer): its
 * own port (`../utils/io/devPorts.ts`), own `root`, own `publicDir` pointing
 * at the repo's shared `public/`.
 *
 * `weslToml` is passed EXPLICITLY: the plugin otherwise reads
 * `<process.cwd()>/wesl.toml`, and `npm run mcpm-workbench` keeps cwd at the
 * repo root, where the RUNTIME's toml lives — omit the path and it silently
 * links against the wrong shader set and never finds this tool's `.wesl` files.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';

import { DEV_PORTS } from '../utils/io/devPorts.ts';
import { distDir } from '../utils/io/distDir.ts';
import { toolPages } from '../utils/io/toolPages.ts';

export default defineConfig(({ command }) => ({
  root: resolve(import.meta.dirname),
  // Build = the /mcpm/ subpath deploy (docs/DEPLOY.md). envDir at the repo
  // root is load-bearing: with `root:` here Vite looks for env files locally
  // and dataUrl() silently falls back to same-origin /data/. publicDir off in
  // build: the main shell already serves those files; copying duplicates GBs.
  base: command === 'build' ? `/${toolPages.mcpmWorkbench}/` : '/',
  publicDir: command === 'build' ? false : resolve(import.meta.dirname, '../../public'),
  envDir: resolve(import.meta.dirname, '../../'),
  build: { outDir: resolve(distDir, toolPages.mcpmWorkbench), emptyOutDir: true },
  server: { port: DEV_PORTS.mcpmWorkbench },
  plugins: [
    viteWesl({
      extensions: [staticBuildExtension],
      weslToml: resolve(import.meta.dirname, 'wesl.toml'),
    }),
    react(),
  ],
}));
