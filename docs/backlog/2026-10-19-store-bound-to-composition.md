# The store is statically bound to the app composition and to React section components

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`navigateSaga.ts:40`, `watchTakeoverSaga.ts:21` and `watchKeyboardEventsSaga.ts:28` import `APP_EXHIBITS`; `combinedSettingsReducer.ts:8` and `captureSettings.ts:39` import `APP_SETTINGS_SLICES`. `APP_EXHIBITS` pulls `data/exhibits/*`, which pulls `components/ExhibitOverlay/kinds/factsKind.ts`, which imports a React component into the store graph. `state/engine/selectors.ts:94-142` reads `galaxyCatalog?.famousMeta`, `aliasIndex`, `starCatalog?…`, `structure?.searchList` by name, and `CommandPaletteContainer.tsx:25-28` wires three Layer-specific search feeds beside the generic `layerSearch` rows. The engine, by contrast, receives the composition injected (`useEngine.ts:91`).

## Direction

Inject exhibits and settings slices into `createAppStore` and the saga context; move famous, alias and structure search onto `layerSearch`. Pairs with "Existing exhibits move into their Layers".
