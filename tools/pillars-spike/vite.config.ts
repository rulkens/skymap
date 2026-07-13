/**
 * Pillars-of-Creation volumetric spike — Vite dev server config.
 *
 * A standalone visual spike: a physically-motivated volumetric rendering of
 * a Pillars-of-Creation-like star-forming column complex — baked 3D density
 * + baked per-star transmittance, a chromatic-extinction raymarcher with
 * Henyey-Greenstein in-scatter and ionization-front emission, HDR star
 * billboards, a dual-filter bloom pyramid, and filmic tone mapping.
 *
 * Like the flow-workbench / famous-curator / galaxy-renderer, it is a
 * sibling dev tool rather than part of the skymap runtime bundle, so it
 * gets its own self-contained Vite app:
 *
 *  - Its own port (5500), clear of the main app's 5173, the curator's 5200,
 *    the flow-workbench's 5300 and the galaxy-renderer's 5400, so all five
 *    can run side-by-side.
 *  - Its own `root` — this directory — so Vite resolves `index.html` from
 *    here rather than the repo root.
 *  - Its own wesl.toml (passed EXPLICITLY, because the plugin otherwise
 *    reads `<process.cwd()>/wesl.toml` — the repo root's — and would link
 *    against the wrong shader set).
 *
 * No React: the spike's UI is a dozen native DOM controls, and pulling in
 * the React toolchain for that would slow the iterate-reload loop the spike
 * exists to serve.
 */

import { resolve } from 'node:path';

import { defineConfig } from 'vite';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';

export default defineConfig({
  root: resolve(__dirname),
  server: { port: 5500 },
  plugins: [
    viteWesl({
      extensions: [staticBuildExtension],
      weslToml: resolve(__dirname, 'wesl.toml'),
    }),
  ],
});
