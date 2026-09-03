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
2. `npm run fetch-dhm` — downloads the LAZ tiles into `data/raw/dhm/`.
3. `npm run bake-lidar` — runs the PDAL pipeline and writes
   `public/data/geo3d/`.
4. `npm run scene-workbench`

Then open <http://localhost:5600> (see `tools/utils/io/devPorts.ts` for the
full port registry).
