# Layer-owned scale fade bands

`needs-design`. The user asked for a design (2026-09-19, PR #755) that
reaches a general version for all Layers. Not a one-off move for one Layer.
Re-checked 2026-10-18, after #912: still open, because #912 moved toggle
fades into the Layers but left the distance bands alone.

## Problem

A Layer's distance-fade tuning lives outside the Layer.
`SCALE_FADE_BANDS` in `src/services/engine/presentation/scaleFadeBands.ts`
is one engine-wide table holding every scale crossfade. Core hands each
consumer fade × clip; the consumer then multiplies its own band in. Nine
rows have a reader in exactly one Layer:

| Rows                                       | Only reader                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `localBubble`, `localBubbleRecede`         | `src/layers/localBubble/present/localBubbleOpacity.ts`                 |
| `zoneOfAvoidance`, `zoneOfAvoidanceRecede` | `src/layers/zoneOfAvoidance/present/deriveZoneOfAvoidanceLiveness.ts`  |
| `constellations`                           | `src/layers/constellations/present/constellationsBand.ts`              |
| `milkyWayApproachSun`, `milkyWayApproachGc` | `src/layers/milkyWay/present/milkyWayCloudLiveness.ts`                |
| `milkyWayStructures`                       | `src/layers/structure/present/structureMarkerStyles.ts`                |
| `starBackdrop`                             | `src/layers/starCatalog/passes/starPointsPass.ts`                      |

So tuning or reading a Layer means visiting a second, central place.

## What the central table is for

Its header calls it "the descent's crossfade transitions, as data". Keeping
the whole descent in one place has real value:

- cross-layer pop-free contracts sit side by side, e.g. the `bodyGlint` /
  mesh handoff, and `localBubbleRecede`'s 10 kpc edge matching
  `constellations`;
- one row is truly shared: `surveyDeepZoom` is read by four Layers
  (cosmicWebDensity, galaxyCatalog, milkyWay, structure) and by core's
  `foregroundMaxDistance`;
- the rest are core's own: `starCaption`, `sunCaption`, `sgrAStarCaption`,
  `bodyGlint`, `bodyGlintBackdrop`, `solarSystemSky` and `sgrAStarLensing`
  (read only by `src/data/rendering/cubemapCaptures.ts`).

A design has to keep that overview and those contracts, not just scatter
the rows across Layers.

## Directions to weigh

- **Layer-declared bands.** Each Layer declares its own rows in its
  definition, and the engine composes them, as `Layer.visibility` entries
  are composed into `APP_VISIBILITY` since #912 (ADR 0012). Shared rows stay
  central, or belong to the Layer that owns the quantity they key on. The
  descent overview then comes from a dev view or a test that lists the
  composed table. This adds a Layer contract member, which needs the user's
  explicit consent.
- **Layer-local files.** No composition: a Layer keeps a
  `present/<layer>FadeBands.ts`. This is simpler and touches no contract,
  but loses the one-table overview and gives cross-layer contracts no home.

## Related

- The "Move `scaleFadeBands` + its four anchor constants to `src/data`"
  backlog item (`ready`, 2026-08-31). Rule on both together, because this
  design may make that move moot.
- "Filaments + flow field lack scale fade bands" (2026-07-24). Those would
  be the first Layers born under the new shape.
- Layer composition step (3), structure cleanup, which is parked: this is a
  natural part of it.
