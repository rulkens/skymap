import type { Vec3 } from '../math/Vec3';

/**
 * The pose's orientation readout in the ENU at its own standpoint.
 * `refAzimuthOf` owns which axis `azimuthRad` is read off; nulling forward's
 * azimuth near nadir drove a measured polar dive THROUGH north-up and back out
 * to 79° off.
 */
export type EyeFrame = {
  readonly localUp: Vec3;
  readonly tiltRad: number;
  readonly east: Vec3;
  readonly north: Vec3;
  readonly azimuthRad: number;
};
