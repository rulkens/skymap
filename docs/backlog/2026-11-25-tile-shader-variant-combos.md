# Tile shader variants keyed by exact effect combinations

**Raised:** 2026-11-25, an adjacent finding of the terrain horizon shadows ground check.

## Current state

- `SURFACE_TILE_SHADER_VARIANTS`
  (`src/layers/body/surfaceTiles/patch/render/surfaceTileShaderVariants.ts:11-19`) has one
  fragment entry per `surfaceEffectsKey`: `''` and `'cloudShadows+materialMap+nightLights'`.
- `SurfaceEffect` (`src/layers/body/surfaceTiles/format/@types/SurfaceEffect.d.ts:5`) has three
  members.
- A body with a new mix of effects (say Mars with clouds) needs a new fragment file and a new row.
  The number of files grows with the number of combinations, not the number of effects.
- Horizon shadows avoid this by being unconditional, not an effect.

## Options

1. One fragment that branches on per-draw uniform flags. Costs some register pressure; needs a
   perf check on the phone.
2. Compose the fragment at link time from per-effect WESL modules (the `weslStaticPlugin` already
   links per variant), so a combination is generated rather than hand-written.
