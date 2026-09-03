# Scene Workbench

A WebGPU dev tool that views baked LiDAR point clouds — the DHM/Punktsky
scans fetched from Denmark's Datafordeler and reduced to skymap's own binary
point format, one scene per real-world location.

This is a sibling dev tool, like `tools/flow-workbench/` and
`tools/mcpm-workbench/` — its own self-contained Vite + React + TS app, local
only. There is no deploy target: unlike those tools it ships no `:build`
script or `/scene-workbench/` subpath.

## Prerequisites

1. A Datafordeler API key in the login keychain (`skymap-datafordeler-apikey`
   — the same key the GeoDanmark ortho harvest uses, see
   `data/raw/geodanmark/README.md`), entitled to the DHM/Punktsky Fildownload
   service.
2. `npm run fetch-dhm` — downloads the `.las` tiles into `data/raw/dhm/`
   (the service serves them uncompressed, despite its `application/zip`
   `Content-Type` — see `data/raw/dhm/README.md`).
3. `npm run bake-lidar` — runs the PDAL pipeline and writes
   `public/data/geo3d/`.
4. `npm run scene-workbench`

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
