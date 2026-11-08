import type { Vec3 } from '../../../../@types/math/Vec3';

/** A famous galaxy resolved on the sky: its direction from the eye, distance and angular radius. */
export type FamousDisc = {
  readonly dir: Vec3;
  readonly distanceMpc: number;
  readonly radiusRad: number;
};
