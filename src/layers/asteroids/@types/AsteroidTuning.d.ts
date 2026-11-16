import type { AsteroidClass } from '../../../@types/asteroids/AsteroidClass';
import type { AsteroidClassLook } from './AsteroidClassLook';
import type { AsteroidBeltRamp } from './AsteroidBeltRamp';
import type { AsteroidColorBy } from './AsteroidColorBy';
import type { AsteroidSizeBy } from './AsteroidSizeBy';

/**
 * The asteroids Layer's DebugPanel cluster: each class's look (`ASTEROID_CLASS_LOOK`), then what is
 * the same for every class: the two look modes, the belt ramp, and the numeric rows of
 * `ASTEROID_PHOTOMETRY` and `ASTEROID_THINNING` it exposes, under their names.
 */
export type AsteroidTuning = {
  readonly perClass: Readonly<Record<AsteroidClass, AsteroidClassLook>>;
  readonly colorBy: AsteroidColorBy;
  readonly sizeBy: AsteroidSizeBy;
  readonly beltRamp: AsteroidBeltRamp;
  readonly liftPerAu2: number;
  readonly liftFloorZoomAu: number;
  readonly liftCapZoomAu: number;
  readonly maxPhaseDimMag: number;
  readonly thinBudget: number;
  readonly thinStartZoomAu: number;
  readonly thinFullZoomAu: number;
  readonly thinGainExponent: number;
};
