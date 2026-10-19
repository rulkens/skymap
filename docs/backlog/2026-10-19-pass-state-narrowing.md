# Narrow `PassState` and hand shared renderers through `LayerCoreDeps`

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`src/@types/engine/frame/PassState.d.ts:12-23` is a `Pick<EngineState>` including `gpu` (38 handles), `subsystems`, `assetSlots`, `data` and `settings`. Asset factories receive the full `EngineState` (`SlotDeps.d.ts:30-33`, `createLayers.ts:219`). `starCatalog` (`starPointsPass.ts:249`, `fieldStarSpherePass.ts:272`, `starSpheresPass.ts:126`) and `blackHoles` (`blackHoleMarkerPass.ts:45,80`) draw through `state.gpu.bodyPickRenderer`; `galaxyCatalog` reads `state.gpu.focusUniform!` although `LayerCoreDeps` already hands it the same object. Because `PassState` depends on the settings root type, the composition cannot be read off `APP_COMPOSITION` (circular alias), which is why `compositions/app.ts`, `appVisibility.ts`, `appSettingsSlices.ts`, `appExhibits.ts` and `data/sources.ts:15-28` are five parallel lists.

## Direction

`PassState` becomes settings, tier, selection and selectionRows plus explicit capabilities. Shared renderers (`bodyPickRenderer`) and the focus uniform are `LayerCoreDeps` members. With the alias broken, derive the four lists from `APP_COMPOSITION`. Decide the order: capabilities first (each Layer stops reading `state.gpu`), then the type narrows, then the lists collapse.
