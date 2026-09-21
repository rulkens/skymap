# Atmosphere density profile altitude-zero is the relief floor, not the datum

`needs-design` — `planetRadiusKm` in `src/data/bodies/atmosphereParams.ts` (via
`seededRadiusKm` = `innerBoundRadiusM`) serves two meanings:

- (a) the shell fragment's ground-hit radius (`shell/fragment.wesl` raySphere on
  `u.bottomRadius`), which MUST stay the relief floor (Titan limb warning at
  `atmosphereParams.ts:224-226`: raising it above the rasterised radius amputates
  the limb glow);
- (b) the density profile's altitude zero (`scattering.wesl:167`), which should
  be the datum: with Mars `reliefM` (F4), Mars rows sit ~2 km low, so a rover
  site reads ~17 % thinner air (scale height 10.8 km); Earth is off by ~5 % at
  the floor.

Fix shape: a second `ScatteringParams` field (`profileZeroKm`, the datum) read
by the density profile only, plus the three LUT bakes that consume it; the row
comment "Altitude 0 is the drawn surface" on the Mars row is stale until then.

Ruled OUT of the 2026-09-21 local-froxel spec (its §3.2 tension 3).
