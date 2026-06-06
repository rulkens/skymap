/**
 * Flow Workbench — Vite dev server config.
 *
 * The Flow Workbench is a CF4++ peculiar-velocity flow visualiser. Like the
 * famous-curator, it is a sibling dev tool rather than part of the skymap
 * runtime bundle, so it gets its own self-contained Vite app:
 *
 *  - Its own port (5300), deliberately clear of the main app's 5173 and the
 *    curator's 5200, so all three can run side-by-side during development.
 *  - Its own `root` — this `tools/flow-workbench/` directory — so Vite resolves
 *    `index.html` from here rather than the repo root.
 *  - Its own `publicDir` pointing at `tools/flow-workbench/public/`, where the
 *    workbench reads a single `flowfield.scfd` — the same `.scfd` flow field
 *    the runtime renders. Unlike the curator (which sets `publicDir: false` to
 *    avoid serving the runtime atlas), this tool DOES need a public dir: it
 *    reads that one static field asset and nothing else. There is no API
 *    plugin — the workbench is purely a static-asset reader, with no
 *    server-side state.
 *
 * The WESL plugin mirrors the main app's setup (`vite.config.ts`): the
 * `staticBuildExtension` resolves `?static` imports by running the WESL linker
 * at build time into a flat WGSL string, so there is no runtime linker
 * dependency. `weslToml` is passed EXPLICITLY because the plugin otherwise reads
 * `<process.cwd()>/wesl.toml` — and `npm run flow-workbench` keeps cwd at the
 * repo root, where the runtime's toml lives. Without the explicit path it would
 * link against the wrong shader set and never find this tool's `.wesl` files.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';

export default defineConfig({
  root: resolve(__dirname),
  publicDir: resolve(__dirname, 'public'),
  server: { port: 5300 },
  plugins: [
    viteWesl({
      extensions: [staticBuildExtension],
      weslToml: resolve(__dirname, 'wesl.toml'),
    }),
    react(),
  ],
});
