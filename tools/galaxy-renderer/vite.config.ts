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
 * Almost every shader it draws with belongs to the runtime: the
 * `milkyWay/{sprites,field,ismMap}/`, `additiveUpsample/`, `bloom/` and
 * `compositor/` trees plus
 * `lib/camera.wesl`, `lib/cloudSprite.wesl` and `lib/tonemap.wesl` all live in
 * `src/services/gpu/shaders/` and reach this build through symlinks — see the
 * `resolve:` block below and `wesl.toml`. Only the tool-only grade trailer
 * (`grade.wesl`) and the fullscreen helper it draws with are local.
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
      replacement: `${resolve(__dirname, `src/engine/shaders/${family}`)}/$2`,
    })),
  },
  plugins: [
    viteWesl({
      extensions: [staticBuildExtension],
      weslToml: resolve(__dirname, 'wesl.toml'),
    }),
    react(),
  ],
});
