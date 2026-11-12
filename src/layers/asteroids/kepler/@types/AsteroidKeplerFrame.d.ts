/**
 * AsteroidKeplerFrame — what one solve needs: the sim time, and the frame's eye, lift, class fades
 * and selection for the cull. `sunFromCamAu` is composed in f64 by the caller.
 */
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { Vec3 } from '../../../../@types/math/Vec3';

export type AsteroidKeplerFrame = {
  /** JD (TT). */
  readonly simJd: number;
  readonly sunFromCamAu: Readonly<Vec3>;
  /** `asteroidExposureRamp` × the Layer's brightness. */
  readonly exposure: number;
  readonly classFade: Readonly<Record<AsteroidClass, number>>;
  /** Catalog row exempt from the flux floor; `SELECTION_NONE_SENTINEL` for none. */
  readonly selectedRow: number;
};
