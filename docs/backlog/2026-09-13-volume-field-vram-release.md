# Release volume-field VRAM when a field is deselected

`needs-design` — the design is settled except for one new read surface; see "Open choice".

## Problem

Unticking a field in the "Cosmic web density" panel fades it out but never frees
its GPU memory. `onRowEnabledChange`
(`src/layers/cosmicWebDensity/ui/CosmicWebDensitySectionContainer.tsx`) dispatches
`writeCosmicWebDensityField({ id, patch: { enabled } })`, a settings write that
drives the `cosmicWebDensityField` fade row
(`src/layers/cosmicWebDensity/present/cosmicWebDensityFadeRows.ts`). The cube stays
resident in the Layer's `VolumeFieldRenderer`'s field `Map` for the life of the
engine — the only release is `destroy()` at teardown.

The three cube rows in `src/layers/cosmicWebDensity/load/cosmicWebDensityAssetRows.ts`
declare no `release` for exactly this reason, and the module header says so.

## Why it matters

Upload is `r16float` 3D (`volumeFieldRenderer.ts:224`) fed straight from the
`.scfd` voxels at `bytesPerRow = dims[0] * 2`, so the on-disk size **is** the VRAM
footprint. Large tier:

| field          | VRAM   | default                                                                             |
| -------------- | ------ | ------------------------------------------------------------------------------------ |
| mcpm           | 155 MB | on (`src/layers/cosmicWebDensity/state/cosmicWebDensity/initialState.ts`, `enabled: true`) |
| polyphorm-2mrs | 217 MB | off                                                                                   |
| edenhofer-dust | 113 MB | not yet wired (renderer slice)                                                        |

Only mcpm is default-on, so this is not idle boot cost — it is the opt-in workflow:
tick polyphorm-2mrs to look at it, untick it, and 217 MB is stranded until page
reload. That is the app's largest single allocation. The dust volume lands another
113 MB on the same path.

Re-loading after a release is cheap: `public/_headers:33` serves `/data/*` as
`max-age=31536000, immutable` against content-hashed filenames, so a retick is a
disk-cache read plus decode, not a network fetch. (Confirm a payload that size
survives the browser's per-resource cache limits.) These are exploratory layers, not
rapidly toggled, so the absence of a hysteresis axis matters far less than it does
for the camera-proximity families.

## Current state

The eviction mechanism already exists and has two users:

- `AssetWiringRow.release?: (ctx) => boolean`, evaluated in `reevaluateDemand.ts`
  (`kind === 'ready' && row.release?.(ctx)` → `slot.release()` → the slot's
  `onRelease`).
- `meshSlotRegistry.ts:24` and `bodyTextureSlotRegistry.ts:82` are both one-liners.
- `VolumeFieldRenderer.unload(id)` (`volumeFieldRenderer.ts:329-342`) already destroys
  all four per-field resources and leaves the fade handle registered, which is the
  correct split — `seedFades` owns the handle set across upload/unload.

So the wiring is three `onRelease` lines plus three `release` predicates.

## The blocker

`release` fires on the frame after the untick, while the fade is still ramping from
~1 to 0 — the cube is destroyed mid-ramp and the field pops instead of fading.
`DemandCtx` exposes `settings`, `request`, `slotState`, `cameraPosMpc`, `simDays` and
nothing about fades, so the predicate cannot express "wait until the ramp reaches 0".

## Open choice

Add fade opacity by handle as a fifth `DemandCtx` read surface, so the predicate reads
`!enabled && fadeOpacity(id) === 0`. That keeps one eviction mechanism rather than
splitting it between the demand loop and a fade-completion callback;
`state.subsystems.fades` is already reachable where the ctx is built. The cost is a new
surface on a type whose docblock is deliberate about having exactly four.
