import type { AsteroidClassColors } from './AsteroidClassColors';

/**
 * The asteroids Layer's DebugPanel cluster: the class tints and the numeric rows of
 * `ASTEROID_PHOTOMETRY`, `ASTEROID_POINT_STYLE` and `ASTEROID_THINNING` it exposes, under their names. The lifted
 * flux floor is held as its V (`limitingMag`), the unit a person tunes in.
 */
export type AsteroidTuning = {
  readonly colors: AsteroidClassColors;
  readonly liftPerAu2: number;
  readonly liftFloorZoomAu: number;
  readonly liftCapZoomAu: number;
  readonly dotRadiusPx: number;
  readonly dotKnee: number;
  readonly selectedRadiusPx: number;
  readonly maxPhaseDimMag: number;
  readonly limitingMag: number;
  readonly thinBudget: number;
  readonly thinStartZoomAu: number;
  readonly thinFullZoomAu: number;
  readonly thinGainExponent: number;
};
