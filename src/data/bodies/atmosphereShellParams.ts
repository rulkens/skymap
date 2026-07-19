/**
 * atmosphereShellParams — the named tunable constants for Earth's in-scatter
 * atmosphere shell (spec §11), co-located with `ATMOSPHERE_PARAMS` the way
 * `cloudShellParams` sits beside the cloud deck's authored data.
 *
 * `ATMOSPHERE_PARAMS` (atmosphereParams.ts) carries the PHYSICAL scattering
 * constants the three LUTs integrate — Rayleigh/Mie/ozone coefficients, scale
 * heights, radii. Those are body physics. This object carries the two
 * per-frame RADIOMETRIC dials the shell draw packs into `AtmosphereUniforms`
 * every frame: the sun brightness fed into the in-scatter integral and the
 * exposure scale on its HDR output. They are look knobs, not physics, so they
 * live here as CPU-side tunables rather than in the physical params table —
 * the same split `earthSurfaceParams` / `pbr.wesl` draws between artistic dials
 * and shading-model floors.
 *
 * ## Eye-tuning intent
 *
 * Both values are starting points calibrated by eye against the lit Earth via
 * HMR (the spec §12 row-E visual pass), not by a unit test — a physically-based
 * sky has no closed-form "correct" brightness, and a numeric restatement would
 * fail on every legitimate look tweak (see conventions/testing.md). Hence no
 * test on this object.
 *
 * - **`sunIrradiance`** scales the solar radiance driving the in-scatter
 *   integral. It is carried through `packAtmosphereUniforms` per the uniform
 *   contract but is currently UNUSED by the shell fragment (the sky-view LUT
 *   bakes its own irradiance normalisation); it is packed so the CPU write
 *   never drifts from the WGSL struct, and it becomes live if the fragment ever
 *   routes it. `1.0` is the neutral starting point — do NOT invent a fragment
 *   routing for it here; that is a shader change, not a data one.
 *
 * - **`exposure`** scales the shell's in-scattered radiance as it lands in the
 *   HDR target, before the shared tone-map compresses it with the rest of the
 *   scene. `1.0` starts neutral so the blue limb and the reddened terminator arc
 *   read at a plausible strength against the tonemapped Earth rather than blowing
 *   out or washing to grey. This value is the SEED DEFAULT for
 *   `settings.earth.atmosphereExposure`, tuned live via the Settings → Display →
 *   Earth slider — the same relationship `DEFAULT_EXPOSURE` in `data/defaults.ts`
 *   has to `tonemap.exposure`. The shell draw reads the settings value each
 *   frame, not this constant, so a drag updates the limb without a reload.
 */

export const ATMOSPHERE_SHELL_PARAMS: {
  readonly sunIrradiance: number; // solar radiance into the in-scatter integral (carried per the uniform contract; fragment-unused today)
  readonly exposure: number; // in-scatter intensity scale into HDR, before the shared tone-map
} = {
  sunIrradiance: 1.0,
  exposure: 1.0,
};
