# The selection row carries its positioner; `LayerCoreDeps.store` goes

**Readiness:** `needs-design`. Ruled 2026-10-29 during #965: the un-braid is the row-carried
positioner below, in its own PR; the `store` member leaves `LayerCoreDeps` in the same PR, once
its last reader is gone for a real reason. Core contract changes inside (`DriverGeometry`,
`deriveBodyStates`, `DemandCtx`), so a spec first.

## Problem

`satellitesSelectionRow.extractRow` already computes the selected satellite's positioner
(`src/layers/satellites/present/satellitesSelectionRow.ts`), but puts only a key on the row
(`driver.poseId`). The positioner itself is mirrored into the module-global `transientPositions`
by `createSelectedSatellites` (`src/layers/satellites/subsystems/createSelectedSatellites.ts`),
whose whole job is keeping that mirror in step with `state.selection` — which is why it
`store.subscribe`s. That subscription is the only reason `LayerCoreDeps` still hands every
Layer the whole `AppStore`: the other two readers (`starCatalog` `chunkSlotsOverride`,
`body` `ui.debugPanelOpen`) are lazy reads a thunk covers (reverted attempt: #965's
`efe978552`). Satellites is `transientPositions`' only writer.

## Shape

- `DriverGeometry` gains `position?: TransientPositioner` beside `poseId`; `deriveBodyStates`
  places the select/focus rows' positioners from `state.selectionRows`, which core's
  `watchSelectionRowsSaga` already refreshes on every selection change.
- `createSelectedSatellites`, `transientPositions`, `satelliteTransientId` and the subscribe go.
- `satellitesAssetRows` reads "a satellite is selected" off `DemandCtx` (needs a `selection`
  field — a pull-model widening, the kind the project prefers) instead of `runtime.selected.any()`.
- `LayerCoreDeps.store` → `settings()` + `debugPanelOpen()` thunks (the reverted commit is the
  diff to re-apply).

## Not ruled

- `Layer.sagas` stays nullary; a `sagas?(runtime)` shape was offered as a workaround and left
  open, not needed once the mirror is gone.
- Whether `DemandCtx.selection` is the whole `SelectionState` or a narrower "selected kinds" read.
