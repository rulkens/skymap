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

export default defineConfig(({ command }) => ({
  root: resolve(import.meta.dirname),
  // Build mode deploys to skymap.rulkens.com/mcpm/ as a subpath of the main
  // shell (see docs/DEPLOY.md): assets get the /mcpm/ prefix, publicDir is
  // dropped (copying the repo's public/ would duplicate the shell's assets and
  // locally drag in the multi-GB gitignored data tree), and envDir points at
  // the repo root so the committed .env.production (VITE_DATA_BASE_URL) is
  // inlined — with root: at this directory Vite would otherwise look for env
  // files HERE and dataUrl() would silently fall back to same-origin /data/,
  // which Workers Assets doesn't serve. Catalog loads then hit R2 directly;
  // the existing CORS rule already covers the skymap.rulkens.com origin.
  base: command === 'build' ? '/mcpm/' : '/',
  publicDir: command === 'build' ? false : resolve(import.meta.dirname, '../../public'),
  envDir: resolve(import.meta.dirname, '../../'),
  build: { outDir: resolve(distDir, 'mcpm'), emptyOutDir: true },
  server: { port: 5500 },
  plugins: [
    viteWesl({
      extensions: [staticBuildExtension],
      weslToml: resolve(import.meta.dirname, 'wesl.toml'),
    }),
    react(),
  ],
}));
