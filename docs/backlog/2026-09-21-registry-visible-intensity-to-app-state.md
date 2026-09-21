# Registry `visible`/`intensity` move to app state

Ruled 2026-09-21: a `SourceEntry` row describes an asset, not what the app
does with it at boot. Whether a source is on and how strong it is drawn is
app state, decided in the owning Layer's `state/<slice>/initialState.ts`.
Today the registry carries both fields and some boot state reads them.

## Fields to remove

- `SourceEntryBase.visible` (`src/@types/data/SourceEntryBase.d.ts:27`) —
  on all 32 rows; only `desiDeep`/`desiWedge`/`desiSgw` are `false`, so the
  star-catalog and body rows carry no information at all.
- `intensity` on `ConstellationsSourceEntry` and `FilamentSourceEntry`, and
  the optional `intensity` on `VolumeFieldDefaults`.

## Readers to re-point (measured at `37c93fcd2`)

Boot state reading its own row — becomes a literal, matching the flow
convention (`src/layers/flow/state/defaults.ts:17`):

- `filaments/state/filaments/initialState.ts` (`visible`, `intensity`)
- `constellations/state/constellations/initialState.ts` (`visible`, `intensity`)
- `milkyWay/state/milkyWay/initialState.ts` (`visible`)
- `src/data/volume/volumeFieldDefaults.ts:71-72` (`visible`, `intensity`)

Item-set derivation `enabled: e.visible` — the three hidden DESI rows become
explicit in `galaxyCatalogs/initialState.ts`; `starCatalogs` and `bodies`
lose the read with no value change:

- `galaxyCatalog/state/galaxyCatalogs/initialState.ts:29`
- `starCatalog/state/starCatalogs/initialState.ts:28`
- `body/state/bodies/initialState.ts:18`

Two derivations outside state that must read boot state instead of the
registry, or they silently diverge from it:

- `src/utils/allVisibleMask.ts:17` — the engine's startup `drawMask`/
  `pickMask`, a second independent source of boot visibility today.
- `tools/fetch/fetchPrebuiltData.ts:55` — decides which prebuilt files to
  download; needs an explicit list or the galaxyCatalogs `initialState`.

## Packaging

Own PR after the state restructure (ruled 2026-09-21). It changes what is
the source of truth for boot visibility, so it cannot ride a branch gated on
an `INITIAL_SETTINGS` byte-diff; land it with that dump as the *expected*
no-change check instead.
