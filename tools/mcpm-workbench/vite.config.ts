/**
 * MCPM Workbench — Vite dev server config.
 *
 * A sibling dev tool (like tools/flow-workbench, tools/galaxy-renderer): its
 * own port, own `root`, own `publicDir` pointing at the repo's shared
 * `public/`. Ports registry: main 5173, curator 5200, flow-workbench 5300,
 * galaxy-renderer 5400 — this tool takes 5500.
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
  server: { port: 5500 },
  plugins: [
    viteWesl({
      extensions: [staticBuildExtension],
      weslToml: resolve(import.meta.dirname, 'wesl.toml'),
    }),
    react(),
  ],
}));
