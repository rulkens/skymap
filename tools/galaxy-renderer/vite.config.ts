/**
 * Galaxy Renderer — Vite dev server config. A sibling dev tool (own port
 * 5400, own `root` at this directory), not part of the runtime bundle.
 * `publicDir` points at the repo's `public/` so the compare panel can serve
 * curated reference images from one source; most shaders are the runtime's
 * own, reached via `resolve:` + `wesl.toml` symlinks.
 *
 * `weslToml` is passed EXPLICITLY: the plugin otherwise reads
 * `<process.cwd()>/wesl.toml`, and `npm run galaxy-renderer` keeps cwd at the
 * repo root, where the RUNTIME's toml lives — omit the path and it links
 * against the wrong shader set and never finds this tool's `.wesl` files.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';

import { distDir } from '../utils/io/distDir.ts';

export default defineConfig(({ command }) => ({
  root: resolve(import.meta.dirname),
  // Build = the /galaxy/ subpath deploy (docs/DEPLOY.md). envDir at the repo
  // root is load-bearing: with `root:` here Vite looks for env files locally
  // and dataUrl() silently falls back to same-origin /data/. publicDir off in
  // build: the main shell already serves those files; copying duplicates GBs.
  base: command === 'build' ? '/galaxy/' : '/',
  publicDir: command === 'build' ? false : resolve(import.meta.dirname, '../../public'),
  envDir: resolve(import.meta.dirname, '../../'),
  build: { outDir: resolve(distDir, 'galaxy'), emptyOutDir: true },
  server: { port: 5400 },
  resolve: {
    // Cross-root WESL: the shared shader families live under the MAIN app's
    // wesl root (src/services/gpu/shaders/<family>) and are reached here
    // through symlinks at src/engine/shaders/<family> — one source, no copy.
    // WESL package paths are root-driven (an include glob alone can discover a
    // file outside the root but cannot bind package::<family>::, and two
    // viteWesl instances conflict — the first claims every ?static load), so
    // the file must APPEAR inside this tool's root. Each alias rewrites an
    // import targeting .../shaders/<family>/*.wesl onto the symlinked path so
    // the wesl-plugin sees an id inside its root and names the module
    // package::<family>::...; preserveSymlinks stops Vite from realpath-ing
    // that id back out to src/services/..., which would undo the alias.
    //
    // The aliases are needed because the RUNTIME modules this tool reuses
    // (createGenerationPipelines, bloomPyramid, compositor, additiveUpsample,
    // and — for its uniform-buffer size const — milkyWayCloudRenderer) spell
    // their `?static` imports relative to the runtime tree. A shader this tool
    // imports by its own relative path is already inside the root and needs no
    // alias — that is why `lib/camera.wesl` and `lib/tonemap.wesl`, reached
    // only through the linker's `package::lib::…`, have no entry here.
    //
    // `milkyWay` is one family entry covering all three tier dirs: the trailing
    // capture takes the rest of the path, so `sprites/`, `field/` and `ismMap/`
    // ride the same rewrite.
    preserveSymlinks: true,
    alias: ['milkyWay', 'additiveUpsample', 'bloom', 'compositor'].map((family) => ({
      find: new RegExp(`^(.*)/shaders/${family}/(.+\\.wesl(\\?.+)?)$`),
      replacement: `${resolve(import.meta.dirname, `src/engine/shaders/${family}`)}/$2`,
    })),
  },
  plugins: [
    viteWesl({
      extensions: [staticBuildExtension],
      weslToml: resolve(import.meta.dirname, 'wesl.toml'),
    }),
    react(),
  ],
}));
