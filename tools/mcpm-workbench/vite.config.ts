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

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { weslStaticPlugin } from '../utils/vite/weslStaticPlugin.ts';

import { DEV_PORTS } from '../utils/io/devPorts.ts';
import { distDir } from '../utils/io/distDir.ts';
import { toolPages } from '../utils/io/toolPages.ts';

// publicDir is off in build, yet the tab icon is the main app's own file: emit
// just that one, at the /favicon.svg the page links (dev serves it from publicDir).
const skymapFavicon = (): Plugin => ({
  name: 'mcpm-workbench-favicon',
  generateBundle() {
    const source = readFileSync(resolve(import.meta.dirname, '../../public/favicon.svg'));
    this.emitFile({ type: 'asset', fileName: 'favicon.svg', source });
  },
});

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
    weslStaticPlugin({ weslToml: resolve(import.meta.dirname, 'wesl.toml') }),
    react(),
    skymapFavicon(),
  ],
}));
