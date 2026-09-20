/**
 * Tuning anchors for `utils/star/starExposureRamp.ts` — see that function's
 * header for the ramp's full design rationale; this file is the data half.
 */

// The near-anchor exposure the SHADER already bakes into STAR_FLUX_EXPOSURE
// (2400 = 400 × 6 in `shaders/lib/starPhotometry.wesl`). The CPU ramp divides
// the live `nearX` by this baked constant so that at the shipped default
// (nearX = 6) the near end returns exactly 1.0 — the shader carries the whole
// near exposure — and a user-dialled nearX hands the DIFFERENCE back out.
export const SHADER_BAKED_NEAR_EXPOSURE = 6;

// Near anchor: 1 pc in Mpc. At or inside this the camera is effectively AT the
// starfield (solar-system scale); the ramp holds at its near-end multiplier
// (`nearX / SHADER_BAKED_NEAR_EXPOSURE`, = 1.0 at the default nearX = 6).
export const RAMP_NEAR_MPC = 1e-6;

// Middle anchor: 3 kpc in Mpc — the intermediate zone where a single near→far
// ramp over-exposes the dense central clump. The ramp passes through `midX`'s
// multiplier here, joining the near→mid and mid→far segments.
export const RAMP_MID_MPC = 3e-3;

// Far anchor: 10 kpc in Mpc — the whole-galaxy view, where the star bin reads as
// the Milky Way's diffuse surface brightness. At or beyond this the ramp holds
// at its far-end multiplier (`farX / SHADER_BAKED_NEAR_EXPOSURE`).
export const RAMP_FAR_MPC = 1e-2;

// The DEFAULT far exposure relative to the baked near baseline: the ratio of the
// two shipped anchors, 28x (far) over 6x (near). This is what the ramp returns
// at/beyond the far anchor when `farX` is left at its default; retained as the
// regression constant the ramp's tests pin the default behaviour against.
export const RAMP_FAR_SCALE = 28 / 6;
