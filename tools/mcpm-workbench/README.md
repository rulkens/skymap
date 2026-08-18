# MCPM Workbench

A WebGPU dev tool that will visualise the **MCPM cosmic-web simulation** —
the constrained-realisation dark-matter density field skymap's volume
renderers already consume, but driven live rather than baked offline. This
task (T1) scaffolds the empty shell only: a Vite + React + TS app with a
canvas that clears to a colour through the HDR-accumulate → tonemap render
graph. No MCPM data, compute, or UI yet — those land in later tasks of the
`mcpm-workbench` plan.

This is a sibling dev tool, like `tools/flow-workbench/` and
`tools/galaxy-renderer/` — its own self-contained Vite + React + TS app, not
part of the skymap runtime bundle.

## Launch

```bash
npm run mcpm-workbench
```

Then open <http://localhost:5500>. The port (5500) is deliberately clear of
the main app (5173), the curator (5200), flow-workbench (5300), and
galaxy-renderer (5400) so all can run side-by-side.

## Shaders

The tool links against the runtime's canonical shader tree
(`src/services/gpu/shaders`) via `wesl.toml`, the same arrangement
`tools/flow-workbench` uses — a future `package::mcpm::…` shader will resolve
identically in both apps. It keeps exactly one shader of its own,
`src/render/shaders/blit.wesl`, the HDR→swapchain tonemap resolve.

## Export verification (Phase 2 gate)

2026-08-18, HEAD `68edbe774`. Headless run (`?probe` synthetic catalog,
small tier, 34 sim steps) captured a `mcpm-20260818-0859.{npy,json,scfd}`
pair — dims 64×64×56, f16, 100k agents, seed 1.

- **Leg 1 (headless export run):** PASS — both download buttons produce
  their files (`.npy` + `polyphy-trace` sidecar; `.scfd`).
- **Leg 2 (importer round-trip):** PASS — `buildRhizomeVolume.ts` accepts
  the captured `.npy` + sidecar untouched and writes a same-dims `.scfd`.
- **Leg 3 (decode agreement):** **BLOCKED.** Decoding the browser's own
  `.scfd` and the importer's `.scfd` and diffing voxels elementwise: of
  229,376 voxels, 188,084 (82%) are bit-identical — but every one of those
  is a background voxel that is zero on *both* sides (206,215/208,511
  zeros respectively). Of the 41,292 non-both-zero voxels, **100% mismatch**
  (max deviation = 1, i.e. full normalised range) — not f16 rounding noise.
  Re-diffing with the importer's X↔Z axes swapped does not resolve it
  (187,461 identical, marginally worse), so this isn't a clean transpose
  either. Root cause (not yet fixed): `exportNpy.ts` writes the trace
  readback's raw bytes (grid.wesl's x-fastest GPU layout) straight to
  `.npy` with no reorder, but `buildRhizomeVolume.ts`/`packLogTraceVoxels`
  default to interpreting `.npy` input as C-order (z-fastest) — the
  convention a real PolyPhy-fork export would satisfy, but this
  workbench's own `.npy` leg does not. `exportScfd.ts` sidesteps the same
  landmine by passing the `'x-fastest'` layout explicitly; `exportNpy.ts`
  has no equivalent switch.
- **Leg 4 (tests):** PASS — `tests/parsers/npyWriter.test.ts`,
  `tests/tools/mcpm-workbench/export/`, `tests/utils/volume/packLogTraceVoxels.test.ts`,
  `tests/tools/buildRhizomeVolume.smoke.test.ts` (15 tests, 4 files) all green.

Preview-vs-live visual check is pending the maintainer's eyes; an automated
orientation check passed during T18's fix round.
