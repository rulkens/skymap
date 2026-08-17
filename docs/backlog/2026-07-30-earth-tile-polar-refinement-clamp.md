# Earth tile polar refinement clamp for plate carrée

`deferred`

## The problem

`planEarthTiles`'s refinement test is an isotropic screen-space error check: a
patch refines whenever its projected on-screen extent implies a level deeper
than the one it is at (`src/utils/scene/planEarthTiles.ts:217-227`, the
`required` computation off `screenPx`). Nothing in that test accounts for tile
aspect ratio. In a plate-carrée grid every longitude column converges at the
poles, so a polar tile is a thin sliver whose bounding box can still read as
"needs more detail" while covering almost no ground area.

Simulating the walk found a camera directly over a pole selects roughly 17x
the tiles it selects over the equator at the same altitude — 704 vs 40 at
100 km. All `2^(z+1)` longitude columns at that latitude band are oversampled
slivers, and every one of them passes the isotropic test independently.

## Verified current state

`planEarthTiles.ts` has no latitude-band or aspect-ratio term anywhere in its
refinement logic — confirmed by reading the full function. The horizon test
(`:171-178`) and frustum test (`:180-210`) are the only rejections before the
level check, and neither is latitude-aware.

Currently masked: at the shipped one-level pyramid the window
(`EARTH_TILE_WINDOW_SIDE`, 128 tiles square) covers the whole z5 grid
(32 columns × 16 rows), so there is nothing to clip differentially by
latitude. It becomes a real, visible cost once Phase E deepens the pyramid
and the grid at the finest level is much larger than the window — the pole
would then request a disproportionate share of the fetch and atlas budget for
no resolution gain.

## What the research found

osgEarth defends against exactly this, by name:
`restrictPolarSubdivision`, default `true`, ramping a minimum tile aspect
ratio from 0.1 starting at level 6 and killing refinement outside the band —
its own source describes this as taking effect "progressively starting at
about +/- 72 degrees latitude" (`SelectionInfo.cpp`). CesiumJS does **not**
carry an equivalent defense for geographic (plate-carrée) tiling schemes.

## Directions to explore (design decides)

- Port osgEarth's ramped minimum-aspect-ratio kill: below some latitude band
  refinement runs unmodified, above it a minimum tile aspect ratio is
  enforced and refinement stops once a tile would fall under it.
- Or fold a latitude term directly into the `required` computation instead of
  a separate gate, so there is one level rule rather than a rule plus an
  exception.
- Either way, the fix wants a synthetic test asserting a pole-vs-equator tile
  count ratio bounded well under the ~17x found here, at a pyramid deep
  enough that the window doesn't mask it.

## Related

`src/utils/scene/planEarthTiles.ts` — the one file this touches.
`docs/superpowers/plans/2026-07-29-earth-surface-virtual-texture-a-to-d.md`
("What the research found", item 5) — the simulation and the citations.
