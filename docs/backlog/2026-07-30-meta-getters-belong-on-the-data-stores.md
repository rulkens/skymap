# Sidecar-meta getters sit on `EngineState`, not on the data stores

`ready` · Engine & State · filed 2026-07-30, out of the #522 review

## What it is

`EngineState.famousGalaxiesMeta` is a getter delegating to
`store.getState().engine.meta.famousGalaxies`. It should be
`state.data.galaxies.famousMeta` — a getter on `GalaxyStore` over the same
selector — with the star twin on the body store.

## Why the getter exists at all

Not as a copy: it has no backing field, and nothing else stores the array.
#522 collapsed two homes into one (main had `GalaxyStore.famousMeta` plus a
`useFamousMeta` hook that fetched `famous_galaxies_meta.json` a second time
into React state, self-documented as a deliberate double-load). The slot
dispatches and retains nothing; the reducer's `[...action.payload]` is the
only copy, made once at write.

Nor is it removable in favour of reading the store at each site. `EngineState`
carries no store reference — the delegating getters _are_ the seam by which
the store reaches engine code. Of the four direct readers, two could go
direct (`engine.ts`'s `resolveDeps` has `store` in scope; `runFrame` has it
via `RunFrameDeps.cb`), but the other two cannot:

- `produceFamousLabels` implements `LabelProducer.produceLabels(state, ctx)`,
  the contract shared with the structure and Milky Way producers.
- `diskRadiusRingLayer` is a `ContentLayer` on the same footing.

Both are registry plugins whose entire input is `state`. Reaching the store
from them means putting `store` on `EngineState` (worse — everything becomes
reachable) or widening two registry contracts, which changes every
implementation to serve two call sites.

## The actual complaint

Placement. `settings` / `tier` / `selection` / `selectionRows` are Intent and
runtime state; a curated sidecar is **loaded data**, and loaded data already
has a home in `EngineState.data`. `GalaxyStore`'s docblock still promises
galaxy consumers "one obvious place to read from", which the top-level key
undercuts.

## Shape

- `createEngineData(store)`; `GalaxyStore.famousMeta` becomes a getter over
  `selectFamousGalaxiesMeta`. Same for the star meta on the body store.
- Drop `EngineState.famousGalaxiesMeta`; repoint the four readers.
  `produceFamousLabels` already opens with `const galaxies = state.data.galaxies`,
  so it gets shorter.
- `wireSlots.ts:106` still claims the meta is read "straight from galaxyStore
  by produceFamousLabels" — true again afterwards, stale until then.

## Related

Adjacent but distinct: [companion-asset relation has three
homes](2026-07-24-companion-asset-relation-three-homes.md) is about how the
sidecar's _demand_ is authored; this is about where its _value_ is read.
