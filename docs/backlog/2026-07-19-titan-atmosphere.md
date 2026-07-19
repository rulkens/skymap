# Titan atmosphere

Titan is seeded in `SCENE_PLANETS` today (`src/data/bodies/scenePlanets.ts`, the
`satelliteBody({ id: 'titan', … })` row) but ships untextured — a flat-lit
albedo sphere. Titan is the one moon in the scene with a genuinely thick,
opaque atmosphere (a nitrogen–methane haze that hides the surface entirely from
visible light), so it is the obvious next pickup once the six-planet atmosphere
work lands. Two levels, honest about what each needs:

## Minimal path — one `ATMOSPHERE_PARAMS` row (zero further code)

The generalized per-body atmosphere wiring shipped with this feature (the
`atmosphereDrawList` iterating atmosphere-bearing bodies) renders any body that
carries an `ATMOSPHERE_PARAMS` entry over its existing sphere. So the cheapest
Titan is a single data row over today's flat albedo sphere:

- thick shell (Titan's atmosphere is proportionally much deeper than Earth's),
- orange/amber tint (the methane–tholin haze colour),
- Mie-dominated / haze-heavy scattering rather than Rayleigh-blue,
- a limb that reads as a soft glowing haze ring.

This is genuinely "just add a row": no renderer, layer, or shader change — the
flat sphere underneath is acceptable because the real Titan surface is not
visible through the haze anyway, so the atmosphere shell is most of what an
observer would see.

## Full path — Venus-style cloud-as-surface + limb (needs the textured-body path)

The higher-fidelity Titan is the Venus treatment: the visible "surface" is the
haze deck itself, supplied as a cloud-as-surface equirect texture through the
fetch/build pipeline (a map fetched by `fetch-textures`, tiered by
`build-textures`, registered in `rawDataRegistry.ts`), plus a
`LIMB_DARKENING_PARAMS` row so the disc darkens toward the limb like a real
lit body. This needs the textured-body path that the current
atmospherics feature deliberately excludes — it is the same shape as Venus
(a cloud deck standing in for the surface), not the flat-sphere shortcut.

## Why the split matters

Recording both levels keeps the "just add a row" shortcut honest: the minimal
row buys a plausible Titan for zero code, but the postcard Titan (a resolved
haze deck with limb darkening) is a texture-pipeline effort, not a data edit.
Pick the level deliberately rather than discovering the gap mid-implementation.
