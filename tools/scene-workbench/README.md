# Scene Workbench

A WebGPU dev tool that views baked LiDAR point clouds — the DHM/Punktsky
scans fetched from Denmark's Datafordeler and reduced to skymap's own binary
point format, one scene per real-world location.

This is a sibling dev tool, like `tools/flow-workbench/` and
`tools/mcpm-workbench/` — its own self-contained Vite + React + TS app, local
only. There is no deploy target: unlike those tools it ships no `:build`
script or `/scene-workbench/` subpath.

## Prerequisites

1. Two keychain credentials, not interchangeable:
   `skymap-datafordeler-apikey` (DHM/Punktsky Fildownload — the same key the
   GeoDanmark ortho harvest uses, see `data/raw/geodanmark/README.md`) and
   `skymap-dataforsyningen-apikey` (skråfoto STAC search + JPEG COGs —
   Dataforsyningen's own self-service token, see
   `data/raw/skraafoto/README.md`). The skråfoto token travels only as a
   `token:` request header or `GDAL_HTTP_HEADERS` — never in a URL.
2. `npm run fetch-dhm` — downloads the `.las` tiles into `data/raw/dhm/`
   (the service serves them uncompressed, despite its `application/zip`
   `Content-Type` — see `data/raw/dhm/README.md`).
3. `npm run bake-lidar` — runs the PDAL pipeline and writes
   `public/data/geo3d/`.
4. `npm run fetch-skraafoto` — downloads the skråfoto STAC items and their
   downsampled JPEGs into `data/raw/skraafoto/` (see
   `data/raw/skraafoto/README.md`).
5. `npm run bake-splats` — trains a Gaussian splat and writes the `splats`
   asset into `public/data/geo3d/`. Needs `bake-lidar` to have already run
   for the group (its `points.bin` seeds the COLMAP model's `points3D`), and
   `brush-cli` and PROJ's `cct` on PATH. Install brush with
   `cargo install --git https://github.com/ArthurBrussee/brush brush-cli`.
   <!-- bake numbers: splatCount / shDegree / wall time — filled after the first real bake -->
6. `npm run scene-workbench`

Then open <http://localhost:5600> (see `tools/utils/io/devPorts.ts` for the
full port registry).

## Architecture

State lives in an RTK store, wired up in `src/store/`; the slices themselves
live one per domain under `src/state/<domain>/` — `registry` (`scenes.json`'s
group list), `group` (the selected group's manifest and per-asset load
status), `view` (camera pose, per-asset visibility, device-lost). Two watcher
sagas own every side effect: `watchRegistrySaga` loads the registry and
auto-selects the
first group; `watchGroupSaga` disposes the previous group, fetches its
manifest, then fetches/parses/uploads each asset. Both reach the WebGPU
objects — `gpu`, `gpuAssets`, the renderer, the depth texture — through
`RenderResources` (`src/render/renderResources.ts`), handed to the saga layer
once via `registerSagaContext`; `Viewport.tsx` stays a dumb frame driver that
only reads it.

The bake CLIs (`npm run fetch-dhm`, `npm run bake-lidar`) write
`public/data/geo3d/scenes.json` (the registry) and
`public/data/geo3d/groups/<id>/manifest.json` alongside one
`groups/<id>/assets/<assetId>/points.bin` per asset (gitignored, not
part of the deployed static bundle). A group's local frame is ENU, +Z up,
metres — `GroupAnchor` (`@types/GroupAnchor.d.ts`) is the geodetic anchor that
places it in the world.

`npm run scene-workbench:probe` runs a headless WebGPU error probe
(`probeGpuErrors.ts`) against a `?probe` synthetic scene
(`src/scene/syntheticProbeScene.ts`) generated in the browser, so it needs no
baked data — see that file's own doc for the `Blob` mechanism.

## Display panel

The left panel's "Display" group holds one nested section per render layer.
"Point cloud" has the point-size slider (`view.display.pointCloud.pointSizePx`,
px). "Gaussian splats" sits beside it with two more: splat scale
(`view.display.gaussianSplat.splatScale`) scales each splat's projected
covariance by `s²` (the standard 3DGS scaling modifier); opacity scale
(`view.display.gaussianSplat.opacityScale`)
multiplies each splat's opacity. Both live in `DisplayPanel.tsx`, wired to
`viewSlice`'s `setSplatScale`/`setOpacityScale`.
