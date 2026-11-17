# Spacecraft tracks are a hidden input to `deriveBodyStates`

**Readiness:** `needs-design`. Parked by the owner on 2026-11-05 (composition ledger, Lane A item 4): moving the store doesn't remove the knot, and nothing is broken today.

**Trigger:** a second engine on one page, such as the reference engine ADR 0013 plans. Both would share one module-level track store.

## Problem

`deriveBodyStates(simDays)` looks like a function of time alone, but its result also depends on `trajectoryRegistry`, a module-level store that `loadSpacecraftTracksSaga` fills after boot. The same `simDays` gives Voyager at Earth before the tracks load and at its real position afterwards.

The rest of the design copes with that:

- `trajectoryRegistry.version()` exists so the `deriveBodyStates` memo can notice the store changing.
- `bodyPositionMpcAt` parks a craft with no track at Earth, so lookups stay total.
- `spacecraftPresent` keeps a parked craft undrawn and its mesh unrequested.
- `loadSpacecraftTracksSaga` requests a frame itself, because a paused loop never re-reads the snapshot.

The store is also a side door: missions writes straight into core, where every other body hands core its position as data on its `LayerBody` row. `orbit` rows carry elements and `site` rows carry a point on a host. A `sampled` row carries everything except the track, which arrives late.

Core has no mission-specific rows here. Tracks are keyed by id, and adding a sampled craft edits no core file.

## Current state

- **Writer:** `src/layers/missions/trails/sagas/loadSpacecraftTracksSaga.ts`.
- **Core readers:** `deriveBodyStates`, `bodyPositionMpcAt`, `spacecraftPresent`.
- **Missions readers:** `missionTrailsPass`, `buildMissionTrails`, `bodyRelativeState`.

## Options that only move the knot

- **The Layer's `guides`** (the ledger's first suggestion): the trail drawing is already in missions. What core needs is the craft's position, for the shared snapshot.
- **`track: () => SampledTrack | undefined` on `SampledBody`, with the store in missions:** matches the `orbit` and `site` pattern and closes the side door, but the hidden input stays, now behind a row field.
- **`loaded()` and `positionMpc()` on `SampledBody`, with the solver in missions:** core stops knowing about tracks, but `sampled` becomes the only kind whose row computes its own position, and the hidden input stays.
- **`state.engine.missions` facts for "loaded":** `deriveBodyStates` and `spacecraftPresent` have no state in hand.

## Where a design could start

Passing tracks through every caller is the wrong shape. About 23 source files call `deriveBodyStates`, the clips among them, and `bodyRegions.ts` calls it at import time, before any engine exists. Most of them don't want craft: `earthFlyout`, `sondermarkenFlyout` and `makeEarthLoop` ask for Earth, and no clip file mentions Voyager.

So only the craft could depend on tracks. This is an untraced sketch:

```ts
// orbit, site and anchor rows: truly a function of time alone
deriveBodyStates(simDays);

// adds the craft, only where an engine exists to hold the tracks
withSampledCraft(states, simDays, tracks);
```

The hard part is finding every caller that can be handed a craft id: camera arms, selection rows and `frameBodyStates` among them. `deriveBodyStates` notes that 22 sites assume `states.get(id)!` always finds a row. `perseveranceToSondermarken` and `watchFlyToLonLatSaga` read the whole snapshot and haven't been checked.

## Related: clips take `simDays`

The owner dislikes that clips take `simDays` at all. Every entry in `clipFactories` is `(simDays) => Clip`, but only `earthFlyout`, `sondermarkenFlyout`, `perseveranceToSondermarken` and `makeEarthLoop` use it, to bake a world position into the opening pose. Timeline effects already avoid this: `moveTargetId` and `dollyToId` name a body and `resolveClipFoci` resolves it at play time.

A `start` that names a body could do the same and turn `clipFactories` into plain data:

```ts
export const earthFlyout: Clip = {
  data: { start: { focus: 'earth', distance, yaw: 0, pitch: 0 }, ... },
};
```

Not traced: `resolveClipStart`, and `perseveranceToSondermarken`, which works out its pivot from the rover and Mars and may need more than a body name. Clips are Lane C of the composition ledger, and this would take them out of the way of the split above.
