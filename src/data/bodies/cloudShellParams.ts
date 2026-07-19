/**
 * cloudShellParams — the named tunable constants for the translucent cloud shell
 * drawn just above Earth's opaque surface (spec §11).
 *
 * One home for the two shell dials, shared by three consumers so they can never
 * drift onto separate literals:
 *
 *   1. **The shell scale** (`cloudShellLayer`): `radiusRatio` scales the unit
 *      sphere the shell rides, lifting it from the surface (unit radius 1.0) to
 *      just above the cloud tops, so the deck floats over the globe instead of
 *      z-fighting the surface it co-registers with.
 *   2. **The shell opacity uniform** (`cloudShellLayer` → `packCloudShellUniforms`):
 *      `opacity` is the coverage-to-alpha multiplier folded into the shell's
 *      straight-alpha output — a global dimmer over the map's per-texel `.a`.
 *   3. **The surface shadow radius** (`earthLayer` → `packEarthSurfaceUniforms`):
 *      the surface pass casts the cloud deck's shadow using the SAME shell radius,
 *      so the shadow geometry and the drawn shell agree by construction (wired in
 *      Task 7 — earthLayer currently passes a literal placeholder there).
 *
 * ## radiusRatio — why ≈1.002
 *
 * The shell radius is expressed in the body's unit-sphere local units, where the
 * surface sits at radius 1.0. Cloud tops top out around ~12.7 km (deep-convective
 * anvils); Earth's mean radius is ~6371 km. So the shell sits at
 * `1 + cloudTopKm / earthRadiusKm ≈ 1 + 12.7 / 6371 ≈ 1.002` — a hair above the
 * surface, enough to clear the depth test against the opaque globe without the
 * gap reading as a visible float at close range. The literal is baked here (not
 * recomputed from km) because it is a look dial, not a measured quantity: the
 * visual pass nudges it if the deck z-fights or floats.
 *
 * ## opacity — neutral start
 *
 * `1.0` passes the map's authored coverage `.a` through untouched — the neutral
 * starting point before the visual pass tunes the deck's overall density against
 * the Blue Marble cloud map. The 1×1 transparent placeholder reports `.a = 0`, so
 * at `opacity = 1.0` the placeholder shell still draws nothing until the real map
 * lands.
 */

export const CLOUD_SHELL_PARAMS: {
  readonly radiusRatio: number; // shell radius in unit-sphere local units (≈ 1 + cloudTopKm/earthRadiusKm)
  readonly opacity: number; // coverage-to-alpha multiplier into the shell's straight-alpha output
} = {
  radiusRatio: 1.002,
  opacity: 1.0,
};
