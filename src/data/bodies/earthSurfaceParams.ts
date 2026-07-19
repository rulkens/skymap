/**
 * earthSurfaceParams — the named tunable constants for Earth's photoreal PBR
 * surface pass (spec §11).
 *
 * These are the CPU-side knobs the `earthLayer` packs into `EarthSurfaceUniforms`
 * every frame. They live in one object here — rather than as scattered literals
 * at the pack site — so the surface's look is tuned in a single place, and the
 * BRDF constants that belong to the shading MODEL (`MIN_ROUGHNESS`,
 * `OCEAN_ROUGHNESS`) stay in `lib/pbr.wesl` next to the maths that reads them.
 * The split is deliberate: pbr.wesl owns the physics floors; this object owns
 * the per-body artistic dials.
 *
 * ## Eye-tuning intent
 *
 * Every value here is a starting point calibrated against the Blue Marble via
 * HMR — the acceptance criterion is a plausible lit Earth with an ocean glint,
 * judged by eye, not a unit test (GGX has no closed-form "correct" brightness).
 *
 * - **`roughnessBase`** scales the material map's per-pixel R (roughness) channel
 *   globally. `1.0` is neutral — it passes the authored roughness through
 *   untouched. Before the real material map lands, the 1×1 placeholder reports
 *   R=1 (fully rough land), so the placeholder Earth renders as a matte,
 *   glint-free diffuse sphere — exactly the "still lit, no glint yet" check Task 8
 *   asks for. Drop it below 1 to add a faint sheen to land.
 *
 * - **`f0`** is the scalar dielectric Fresnel reflectance at normal incidence.
 *   The whole PBR effort exists for the ocean glint, so this biases to WATER
 *   (~0.02) rather than rock (~0.04) — a single scalar can't be both, and the
 *   sea is the star. `pbr.wesl`'s `fresnelSchlick` still ramps it to 1.0 at the
 *   grazing terminator regardless, so land keeps a believable rim.
 *
 * - **`sunIrradiance`** scales the DIRECT (sun-lit) term before the ambient floor
 *   is added. It is set to roughly PRESERVE the brightness of the previous
 *   `litShade` path, so swapping in PBR is not also a brightness change. The old
 *   fragment computed `albedo * (AMBIENT + (1 - AMBIENT) * lambert)`, so the
 *   direct (non-ambient) lit-side peak was `albedo * 0.92 * NoL`. The new diffuse
 *   term routes through Oren-Nayar, which at low roughness returns the ideal
 *   Lambert BRDF `albedo / PI`, so `pbrDirect ≈ (albedo / PI) * NoL` on the lit
 *   diffuse side. Matching the two — `sunIrradiance / PI == 0.92` — gives
 *   `sunIrradiance ≈ 0.92 * PI ≈ 2.9`; rounded to `3.0` for a hair more punch
 *   (the specular glint adds energy on top, so a touch under a full PI keeps the
 *   diffuse hemisphere from over-brightening). The ambient floor is unchanged —
 *   both paths add `AMBIENT * albedo` — so only the lit side is being matched.
 *
 * - **`cloudShadowStrength`** is `0` in plan A: the cloud shell (plan D) is what
 *   multiplies the direct term by a cloud-shadow factor. It is carried through
 *   the uniform now only so plan D never has to reshape the struct.
 */

export const EARTH_SURFACE_PARAMS: {
  readonly roughnessBase: number;
  readonly f0: number;
  readonly sunIrradiance: number;
  readonly cloudShadowStrength: number;
} = {
  roughnessBase: 1.0,
  f0: 0.02,
  sunIrradiance: 3.0,
  cloudShadowStrength: 0,
};
