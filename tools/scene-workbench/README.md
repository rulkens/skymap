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
   `cargo install --locked --git https://github.com/ArthurBrussee/brush brush-cli`
   (`--locked` is load-bearing: an unlocked build pulls a burn revision that
   panics in Brush's splat initialisation).
   Splats below the LiDAR floor, and those outside the group's `bounds` (the
   same crop PDAL applies to the LiDAR), are pruned on the way into `splats.bin`:
   every frame is airborne, so training is free to park large ground-coloured
   Gaussians underground, where they are invisible from above and a wall of
   flat colour once the camera descends. Removing that layer is what stopped
   the viewport turning one flat colour whenever the orbit target sank below
   the terrain. `npm run bake-splats -- --reuse-ply` re-packs the last export
   instead of training again, which is how to re-tune that prune without
   paying for another 30k-iteration run; it carries the brush-cli version
   already in `manifest.json`, so it neither retrains nor re-stamps.
   First Søndermarken bake (2026-09-10, 306 frames, Apple Silicon): 30k
   iterations is a multi-hour run, and slows as densification grows the model;
   this one was stopped after ~3 h 20 min at its last 5,000-step export.
   That export held 7,771,755 splats; the floor prune (0.1% LiDAR quantile
   −17.1 m, less the 5 m margin) dropped 1,773,702, leaving **5,998,053
   splats, SH degree 1, 240 MB `splats.bin`**. A `--reuse-ply` repack takes
   about 20 s.
6. `npm run scene-workbench`

Every fetch/bake CLI above takes `--group <id>` (default `soendermarken`);
the registry is `tools/scene-recon/groups/sceneGroupFromArgv.ts` and each
group writes to its own `public/data/geo3d/groups/<id>/`, so `scenes.json`
grows an entry the first time one of its manifests is written.

Then open <http://localhost:5600> (see `tools/utils/io/devPorts.ts` for the
full port registry).

## Groups

`soendermarken` covers the whole park from whole 1920-px frames — ~740 mm/px on
the ground, which is why its splats are soft. `soendermarken-crop` shares its
anchor (so the two are directly comparable in ENU metres) over a 258 x 183 m box
in the western half of the park, harvested at **200 mm/px**: `fetchSkraafoto` crops
each COG to the box before downsampling, which is the only way to spend the
COG's native ~100 mm/px on a scene this size (`data/raw/skraafoto/README.md`,
"Window recipes"). Baking it:

```
npm run fetch-dhm      -- --group soendermarken-crop   # 2 of the 8 LAS tiles
npm run bake-lidar     -- --group soendermarken-crop   # 17,001 points, 272 KB
npm run fetch-skraafoto -- --group soendermarken-crop  # into <collection>/soendermarken-crop/
npm run bake-splats    -- --group soendermarken-crop
```

Its LiDAR uses `minPointSpacingM` 0.5 rather than 1.0; the DHM 2011 cloud is
only ~0.36 pts/m² here, so that buys 17,001 points against 14,560 (measured),
not four times as many.

## Architecture

State lives in an RTK store, wired up in `src/store/`; the slices themselves
live one per domain under `src/state/<domain>/` — `registry` (`scenes.json`'s
group list), `group` (the selected group's manifest and per-asset load
status), `view` (camera pose, per-asset visibility, per-layer display knobs,
device-lost). Three watcher sagas own every side effect: `watchRegistrySaga`
loads the registry and auto-selects the first group; `watchGroupSaga` disposes
the previous group, fetches its manifest, then fetches/parses/uploads each
asset; `watchSplatSortSaga` re-sorts splat draw order at each camera commit.
All three reach the WebGPU
objects — `gpu`, `gpuAssets`, the renderer, the depth texture — through
`RenderResources` (`src/render/renderResources.ts`), handed to the saga layer
once via `registerSagaContext`; `Viewport.tsx` stays a dumb frame driver that
only reads it.

The bake CLIs (`npm run bake-lidar`, `npm run bake-splats`) write
`public/data/geo3d/scenes.json` (the registry) and
`public/data/geo3d/groups/<id>/manifest.json` alongside one
`groups/<id>/assets/<assetId>/{points,splats}.bin` per asset (gitignored, not
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

Under them sits the clip box (`view.display.gaussianSplat.clipBoxM`,
group-frame metres): a checkbox that opens at the asset's full extent and six
min/max sliders, one per axis, with a `drawn / total splats` readout. It is a
performance control, not a masking one — `sortSplatOrder` only admits the
splats inside the box, so the box shortens both the CPU depth sort and the
instance count `splatRenderer` draws, rather than discarding fragments that
were sorted and issued anyway. `watchSplatSortSaga` re-sorts whenever the box
moves; `null` (the default) takes the unclipped path with no filter pass at
all. The extent and the survivor count reach the panel through
`group.splatMetrics`, which the sort reports after every run.
