# Narrow `PassState` and hand shared renderers through `LayerCoreDeps`

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`src/@types/engine/frame/PassState.d.ts` still picks `gpu` and `subsystems` off `EngineState` (the `data` and `assetSlots` bags left with the body Layers). Asset factories receive the full `EngineState` (`SlotDeps.d.ts`, `createLayers.ts`). `starCatalog` (`starPointsPass.ts`, `fieldStarSpherePass.ts`, `starSpheresPass.ts`) and `blackHoles` (`blackHoleMarkerPass.ts`) draw through `state.gpu.bodyPickRenderer`, so a Layer pass can reach any core renderer and nothing flags it. (#965 already moved `focusUniform` onto the Runtime.)

## Direction

`PassState` becomes settings, tier, selection and selectionRows plus explicit capabilities. Shared renderers (`bodyPickRenderer`) become `LayerCoreDeps` members. Order: capabilities first (each Layer stops reading `state.gpu`), then the type narrows. The composition-root registries are ADR 0014's decided shape and stay.
