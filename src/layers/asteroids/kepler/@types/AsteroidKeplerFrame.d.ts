/**
 * AsteroidKeplerFrame — what one solve needs: the sim time, and the frame's eye, lift, class fades,
 * selection and the tuned photometry for the cull. `sunFromCamAu` is composed in f64 by the caller.
 */
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { Vec3 } from '../../../../@types/math/Vec3';

export type AsteroidKeplerFrame = {
  /** JD (TT). */
  readonly simJd: number;
  readonly sunFromCamAu: Readonly<Vec3>;
  /** Per class, `asteroidExposureRamp` × the Layer's brightness. */
  readonly exposure: Readonly<Record<AsteroidClass, number>>;
  readonly classFade: Readonly<Record<AsteroidClass, number>>;
  /** The faintest stored H each class keeps under the brightness budget (`asteroidHLimitCenti`). */
  readonly hLimitCenti: Readonly<Record<AsteroidClass, number>>;
  /** Catalog row exempt from the flux floor; `SELECTION_NONE_SENTINEL` for none. */
  readonly selectedRow: number;
  /** The discard floor on the lifted flux. */
  readonly minFlux: number;
  /** Most the phase law may dim a dot, in mag. */
  readonly maxPhaseDimMag: number;
};
