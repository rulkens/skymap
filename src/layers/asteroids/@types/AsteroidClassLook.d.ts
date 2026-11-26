import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';

/**
 * What a dot of one asteroid class looks like: its tint (linear RGB, near unit luminance), a gain on
 * its lifted flux, the flux floor as a V, and the dot's shape. Each a DebugPanel per-class row.
 */
export type AsteroidClassLook = {
  readonly color: Vec3;
  readonly brightness: number;
  readonly limitingMag: number;
  readonly dotRadiusPx: number;
  readonly dotKnee: number;
  readonly sizeKneeH: number;
  readonly sizeMaxScale: number;
};
