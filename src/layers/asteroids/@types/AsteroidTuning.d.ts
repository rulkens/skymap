import type { AsteroidClassColors } from './AsteroidClassColors';
import type { AsteroidBeltRamp } from './AsteroidBeltRamp';
import type { AsteroidColorBy } from './AsteroidColorBy';
import type { AsteroidSizeBy } from './AsteroidSizeBy';

/**
 * The asteroids Layer's DebugPanel cluster: the two look modes, the class tints and belt ramp, and the
 * numeric rows of `ASTEROID_PHOTOMETRY`, `ASTEROID_POINT_STYLE` and `ASTEROID_THINNING` it exposes,
 * under their names. The lifted flux floor is held as its V (`limitingMag`), the unit a person tunes in.
 */
export type AsteroidTuning = {
  readonly colorBy: AsteroidColorBy;
  readonly sizeBy: AsteroidSizeBy;
  readonly colors: AsteroidClassColors;
  readonly beltRamp: AsteroidBeltRamp;
  readonly liftPerAu2: number;
  readonly liftFloorZoomAu: number;
  readonly liftCapZoomAu: number;
  readonly dotRadiusPx: number;
  readonly sizeKneeH: number;
  readonly sizeMaxScale: number;
  readonly dotKnee: number;
  readonly maxPhaseDimMag: number;
  readonly limitingMag: number;
  readonly thinBudget: number;
  readonly thinStartZoomAu: number;
  readonly thinFullZoomAu: number;
  readonly thinGainExponent: number;
};
