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

2026-08-18, HEAD `05556bd02`. Headless run (`?probe` synthetic catalog,
small tier, 34 sim steps, paused before exporting so both legs read the
identical static trace) captured a `mcpm-20260818-0915.{npy,json,scfd}`
pair — dims 64×64×56, f16, 100k agents, seed 1.

- **Leg 1 (headless export run):** PASS — both download buttons produce
  their files (`.npy` + `polyphy-trace` sidecar; `.scfd`).
- **Leg 2 (importer round-trip):** PASS — `buildRhizomeVolume.ts` accepts
  the captured `.npy` + sidecar untouched and writes a same-dims `.scfd`.
- **Leg 3 (decode agreement):** PASS — decoding the browser's own `.scfd`
  and the importer's `.scfd` and diffing all 229,376 voxels elementwise:
  **100% bit-identical, max deviation = 0.** Fixed in this round:
  `exportNpy.ts` was writing the trace readback's raw bytes (grid.wesl's
  x-fastest GPU layout) straight to `.npy` with no reorder, while
  `buildRhizomeVolume.ts`'s default `packLogTraceVoxels` call — matching a
  real PolyPhy-fork export, per the shipped MCPM volumes rendering
  correctly — expects true NumPy C-order. `exportNpy.ts` now transposes
  through a new `xFastestToCOrder` (pure index permutation, no value
  change) before writing, so this tool's `.npy` leg is byte-diffable
  against a real fork export the same way `exportScfd.ts` already was.
  (An earlier un-paused capture showed a smaller residual deviation from
  the sim continuing to step between the two separate download clicks —
  not an export bug; pausing first eliminated it.)
- **Leg 4 (tests):** PASS — `tests/parsers/npyWriter.test.ts`,
  `tests/tools/mcpm-workbench/`, `tests/utils/volume/packLogTraceVoxels.test.ts`,
  `tests/tools/buildRhizomeVolume.smoke.test.ts` (67 tests, 22 files) all
  green, including new `exportNpy.test.ts` coverage for the transpose.

Preview-vs-live visual check is pending the maintainer's eyes; an automated
orientation check passed during T18's fix round.
