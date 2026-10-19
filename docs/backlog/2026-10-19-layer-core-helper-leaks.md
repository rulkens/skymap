# Layers import core's private helpers and core holds Layer tuning

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

Layer to core internals: `milkyWay` imports `galaxyGenerator/v1/*` 13 times (the Milky Way model lives in core and core's `scaleFadeBands.ts:19` depends on it); `structure` imports `pickDepthFormat` from `frame/pickProgram` (`structureMarkerRenderer.ts:74`); `starCatalog` imports `helpers/resolveStarRecord` and `helpers/nearestResolvableStar`, and `galaxyCatalog` imports `helpers/focusedFamousIndex`, `wiring/galaxyCatalogRequest` and `presentation/famousLabelStyle`, none with another consumer. Core to Layer: `utils/star/planStarChunks.ts:15-26` imports starCatalog's private `@types` and `render/starCutLayout`; `SCALE_FADE_BANDS` holds rows for ZoA, localBubble, constellations, star captions and the lens.

## Direction

Move each single-consumer helper into its Layer with `npm run move-files`. Expose the pick depth format through the slab, not `pickProgram`. Make fade bands a Layer declaration (`Layer.fadeBands`) composed like visibility entries. Extract the Milky Way model into the `milkyWay` Layer and delete `galaxyGenerator/v1` (CLAUDE.md already marks it).
