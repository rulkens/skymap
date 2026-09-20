# Layer-owned scale fade bands

`needs-design`. The user asked for a design (2026-09-19, PR #755) that
reaches a general version for all Layers. Not a one-off move for one Layer.

## Problem

A Layer's distance-fade tuning lives outside the Layer.
`SCALE_FADE_BANDS` in `src/services/engine/presentation/scaleFadeBands.ts`
is one engine-wide table holding every scale crossfade. Some rows belong to
a single Layer:

| Rows                                       | Only reader                                                         |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `localBubble`, `localBubbleRecede`         | `src/layers/localBubble/present/localBubbleOpacity.ts`              |
| `zoneOfAvoidance`, `zoneOfAvoidanceRecede` | `src/layers/zoneOfAvoidance/present/zoneOfAvoidanceLayerOpacity.ts` |
| `constellations`                           | `services/engine/presentation/constellationLayerOpacity.ts`         |

So tuning or reading a Layer means visiting a second, central place.

## What the central table is for

Its header calls it "the descent's crossfade transitions, as data". Keeping
the whole descent in one place has real value:

- cross-layer pop-free contracts sit side by side, e.g. the `bodyGlint` /
  mesh handoff, and `localBubbleRecede`'s 10 kpc edge matching
  `constellations`;
- some rows really are shared: `surveyDeepZoom` has 9 readers,
  `sgrAStarLensing` 3, and `starCaption`/`sunCaption` several.

A design has to keep that overview and those contracts, not just scatter
the rows across Layers.

## Directions to weigh

- **Layer-declared bands.** Each Layer declares its own rows in its
  definition, and the engine composes them the way #750 composes Layer
  settings. Shared rows stay central, or belong to the Layer that owns the
  quantity they key on. The descent overview then comes from a dev view or
  a test that lists the composed table.
- **Layer-local files.** No composition: a Layer keeps a
  `present/<layer>FadeBands.ts`. This is simpler, but loses the one-table
  overview and gives cross-layer contracts no home.

## Related

- The "Move `scaleFadeBands` to `src/data`" backlog item (`ready`,
  2026-08-31). Rule on both together, because this design may make that
  move moot.
- The "Bundle-declared fade rows — union totality" item (2026-08-20). This
  is the same composition question, for `FadeLayer` rows.
- "Filaments + flow field lack scale fade bands" (2026-07-24). Those would
  be the first Layers born under the new shape.
- Layer composition step (3), structure cleanup, which is parked: this is a
  natural part of it.
