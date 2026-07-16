# Bright star clump at intermediate zoom (~5.9 kpc)

**Status:** deferred (low priority — user verdict 2026-07-17: "ok for now")

## Problem

At camera distances of a few kpc (reference pose: `target [0,0,0], distance
0.0058922765, yaw 5.4131, pitch -0.1237`), the dense central region of the
Gaia star bin reads over-bright relative to the same region viewed refined
from close up (e.g. distance `0.00020426082`, same direction — "completely
fine"). The aggregate LOD representation *looks* non-flux-conserving even
though it isn't.

## Verified current state (2026-07-17, `stars-large.bin`, 12.85M stars)

Diagnostic script: scratch `fluxFill.ts` (reconstructs the orbit pose, runs the
real `walkStarOctreeCut`, compares cut deposit vs per-star ground truth).

- **Flux is conserved, slightly UNDER at distance:** cut/truth = **0.58** at
  5.9 kpc (aggregates attenuate a whole subtree at its centroid distance —
  1/d² convexity), **0.995** at 204 pc. Aggregates carry 98.3% of the cut's
  light at the far pose.
- The blowout was therefore display-side, three stacked factors:
  1. Real physical concentration (millions of stars' summed light in a small
     central patch — ~28 HDR units/px average, far past white + bloom threshold).
  2. Exposure ramp near its far anchor: ×4.3 at 5.9 kpc vs ×2.4 at 204 pc.
  3. Knee asymmetry: per-quad compression tamed concentrated leaf dots but
     stacked sub-knee aggregate quads escaped it entirely.

## What already shipped against it (same branch, `feat/gaia-star-bin-03-runtime`)

- **Summed-field knee** (`62c042ed`): aggregates render linear into the
  half-res offscreen; the `star-upsample` composite applies `starKnee` to the
  SUMMED field (`shaders/starCatalog/knee.wesl` is the one home). Fixes
  factor 3 structurally.
- **`Exposure (mid)` slider** (`224bd495`): third ramp anchor at 3 kpc
  (`RAMP_MID_MPC`, default 57 = the old curve's value there). Live lever for
  factor 2 in exactly the 1–6 kpc zone.

## Remaining levers if it still bothers

- Retune `DEFAULT_STAR_EXPOSURE_MID_X` down from 57 (one number).
- Move `RAMP_MID_MPC` if 3 kpc is the wrong pivot for where the clump peaks.
- A tone-map-side soft shoulder for the summed star field (the composite
  shader is the natural hook — it already owns the summed value).
- Note factor 1 is honest physics: full "fix" means choosing how much of the
  galaxy's true central surface brightness to show, i.e. an exposure policy
  question, not a bug.
