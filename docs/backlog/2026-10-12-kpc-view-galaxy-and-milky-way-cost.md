# Galaxy points and the Milky Way sprite cloud at kpc views

**Readiness:** `needs-design` (measure first). **Surfaced:** 2026-10-12, phone perf work on the chunked star octree (#885).

## Problem

At the milky-way perf pose a Mac frame is ~18 ms (`npm run perf`), of which the whole star layer is ~3 ms
(star-aggregates·NEAR0 1.8, star-cut 0.5, star points 0.5; measured 2026-10-12 on the #885 branch). The rest is shared with main: chiefly the v1 Milky Way sprite cloud
(`src/services/engine/galaxyGenerator/v1/`, drawn by `src/layers/milkyWay/`) and the galaxy point layer
(`src/layers/galaxyCatalog/`). On the user's phone (OnePlus 7T, Brave) the far view runs 17.6 ms median but
~40 ms p95 on main and branch alike, so these shared layers, not the stars, set the phone's far-view budget.

## Current state

- The Milky Way cloud already renders its additive sprites into a 1/6-resolution offscreen
  (`aggregateDivisor: 6`, `milkyWayCalibration.ts:110`; target `milkyWayAggregateTarget.ts`), so its fill is
  cut ~36×. What remains is likely vertex work: one billboard per sprite, `starCount` seeded per tier as half /
  1× / 2× the preset (`milkyWayCalibration.ts`, `MILKY_WAY_STARS_PER_TIER`).
- Galaxy points draw every catalog galaxy in view as an instanced quad (`instancedQuadRenderer.ts:409`,
  `draw(6, instanceCount)`); from inside the Milky Way every galaxy is ≥ ~1 Mpc away and mostly sub-pixel, and
  no distance- or brightness-based thinning applies there (unverified — check `galaxyCatalog` frame/visibility).
- Both layers compete with the star points for the phone's vertex pipeline.

## Options (measure per pass before choosing)

1. Galaxies at kpc scale: draw a coarser tier, or cull below an apparent-brightness / pixel-size floor, when the
   eye is inside the Milky Way. Near-invisible change; saves vertex work proportional to the culled count.
2. Milky Way cloud: fewer sprites on the small tier, or sprite LOD by screen size; the lasting fix is retiring v1
   for the analytic field (see "Draw the v2 analytic Milky Way in the `milkyWay` Layer").
3. Cap sprite screen size if per-pass timings show fill rather than vertex cost.

## First step

`npm run perf` per-pass at milky-way and solar (Mac), and `?gpuTimings` + the `d` timings panel on the phone
(`phone` skill), main build — then pick between the options by the dominant pass.
