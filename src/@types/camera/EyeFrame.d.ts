import type { Vec3 } from '../math/Vec3';

/**
 * The pose's orientation readout in the ENU at its own standpoint. `azimuthRad`
 * is what the user calls "how far off north the view is": read off screen-up
 * below 45° tilt and off forward above — their horizontal parts are cos(tilt)
 * and sin(tilt) long, so they trade places there. For a roll-free pose the two
 * agree; while an arriving roll is still bleeding out, the chosen one is the
 * user-visible residual (nulling forward's near nadir drove a measured polar
 * dive THROUGH north-up and back out to 79° off).
 */
export type EyeFrame = {
  readonly localUp: Vec3;
  readonly tiltRad: number;
  readonly east: Vec3;
  readonly north: Vec3;
  readonly azimuthRad: number;
};
