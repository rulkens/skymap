/**
 * Tuning anchors for `utils/star/starExposureRamp.ts` — see that function's
 * header for the ramp's design; this file is the data half.
 */

/** Near-anchor exposure already baked into the shader's `STAR_FLUX_EXPOSURE`. */
export const SHADER_BAKED_NEAR_EXPOSURE = 6;

/** Near anchor: 1 pc in Mpc — effectively AT the starfield (solar-system scale). */
export const RAMP_NEAR_MPC = 1e-6;

/** Middle anchor: 3 kpc in Mpc — joins the near→mid and mid→far segments. */
export const RAMP_MID_MPC = 3e-3;

/** Far anchor: 10 kpc in Mpc — whole-galaxy view, Milky Way surface brightness. */
export const RAMP_FAR_MPC = 1e-2;

/** Default far/near exposure ratio (28x / 6x); the ramp's regression pin. */
export const RAMP_FAR_SCALE = 28 / 6;
