# Terrain ambient tinted by the sky-view LUT

**Raised:** 2026-11-25, deferred from the terrain horizon shadows spec
(`docs/superpowers/specs/completed/2026-11-25-terrain-horizon-shadows-design.md` §6).

## Current state

- The horizon spec scales the existing ambient term by sky visibility. The term's colour stays a
  per-body constant (`BODY_AMBIENT_LIGHT`, `src/data/bodies/bodyAmbientLight.ts:4`, passed in by
  `surfaceTilesPass.ts`).
- As a result, shadowed ground on Earth reads grey instead of sky-blue, and on Mars it lacks the
  butterscotch tint.
- The sky-view LUT that holds the right colour is private to `atmosphereShellRenderer.ts:78`. Its
  interface has no getter, and none of the tile, Earth-globe or texturedBody pipelines binds it.

## Options

1. Expose the LUT view through the atmosphere renderer's interface, bind it in the tile and globe
   pipelines, and tint the ambient term by the LUT's sky irradiance at the fragment's up vector.
   That couples two subsystems, so the joint needs a design.
2. Have the CPU compute one sky-irradiance colour per frame per body from the same LUT model and
   pass it as a uniform. No new binding, but the colour is no longer per pixel.
