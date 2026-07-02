/**
 * Galaxy Renderer — Vite dev server config.
 *
 * The Galaxy Renderer is a procedural, parametric Hubble-sequence galaxy
 * instrument — hundreds of thousands of instanced star sprites behind an
 * HDR bloom pipeline, tunable against real astrophotography. Like the
 * flow-workbench and the famous-curator, it is a sibling dev tool rather
 * than part of the skymap runtime bundle, so it gets its own self-contained
 * Vite app:
 *
 *  - Its own port (5400), deliberately clear of the main app's 5173, the
 *    curator's 5200, and the flow-workbench's 5300, so all four can run
 *    side-by-side during development.
 *  - Its own `root` — this `tools/galaxy-renderer/` directory — so Vite
 *    resolves `index.html` from here rather than the repo root.
 *  - Its `publicDir` points at the REPO's `public/` (`../../public`), so the
 *    validation/compare panel can serve the curated reference images at
 *    `/images/famous-curated/...` for descriptor-based auto-fit — one asset
 *    source, no copy to keep in sync.
 *
 * Unlike the flow-workbench (which links against the runtime's canonical
 * shader tree because it drives the real flow renderer), this tool's
 * renderer is entirely its own — a new instrument, not an adapter around an
 * existing one — so its shaders live under `src/engine/shaders/` and are
 * wholly self-contained (see `wesl.toml`).
 *
 * `weslToml` is passed EXPLICITLY because the plugin otherwise reads
 * `<process.cwd()>/wesl.toml` — and `npm run galaxy-renderer` keeps cwd at
 * the repo root, where the runtime's toml lives. Without the explicit path
 * it would link against the wrong shader set and never find this tool's
 * `.wesl` files.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';

export default defineConfig({
  root: resolve(__dirname),
  publicDir: resolve(__dirname, '../../public'),
  server: { port: 5400 },
  plugins: [
    viteWesl({
      extensions: [staticBuildExtension],
      weslToml: resolve(__dirname, 'wesl.toml'),
    }),
    react(),
  ],
});
