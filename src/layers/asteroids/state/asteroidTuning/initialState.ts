import type { AsteroidTuning } from '../../@types/AsteroidTuning';
import { ASTEROID_CLASS_LOOK } from '../../points/data/asteroidClassLook';
import { ASTEROID_BELT_RAMP } from '../../points/data/asteroidBeltRamp';
import { ASTEROID_PHOTOMETRY as P } from '../../points/data/asteroidPhotometry';
import { ASTEROID_THINNING } from '../../points/data/asteroidThinning';

export const initialState: AsteroidTuning = {
  perClass: ASTEROID_CLASS_LOOK,
  colorBy: 'class',
  sizeBy: 'absoluteMagnitude',
  beltRamp: ASTEROID_BELT_RAMP,
  lift: P.lift,
  maxPhaseDimMag: P.maxPhaseDimMag,
  ...ASTEROID_THINNING,
};
