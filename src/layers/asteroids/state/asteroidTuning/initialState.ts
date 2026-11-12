import type { AsteroidTuning } from '../../@types/AsteroidTuning';
import { ASTEROID_CLASS_COLORS } from '../../points/data/asteroidClassColors';
import { ASTEROID_PHOTOMETRY as P } from '../../points/data/asteroidPhotometry';
import { ASTEROID_POINT_STYLE as S } from '../../points/data/asteroidPointStyle';
import { ASTEROID_THINNING } from '../../points/data/asteroidThinning';

export const initialState: AsteroidTuning = {
  colors: ASTEROID_CLASS_COLORS,
  liftPerAu2: P.liftPerAu2,
  liftFloorZoomAu: P.liftFloorZoomAu,
  liftCapZoomAu: P.liftCapZoomAu,
  dotRadiusPx: S.dotRadiusPx,
  dotKnee: P.dotKnee,
  selectedRadiusPx: S.selectedRadiusPx,
  maxPhaseDimMag: P.maxPhaseDimMag,
  limitingMag: P.limitingMag,
  ...ASTEROID_THINNING,
};
