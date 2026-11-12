import { ASTEROID_PHOTOMETRY as P } from '../data/asteroidPhotometry';

/**
 * Display lift on the dots' flux by the camera's distance from the Sun, in AU: true flux would leave the
 * belt at ~1e-4 of visible from 5–10 AU, and a monitor can't dark-adapt (cf. `starExposureRamp`).
 * Exactly 1 inside `rampNearAu`, geometric (log lift vs log distance) to `rampFarLift`, flat beyond.
 */
export function asteroidExposureRamp(camSunDistAu: number): number {
  if (camSunDistAu <= P.rampNearAu) return 1;
  if (camSunDistAu >= P.rampFarAu) return P.rampFarLift;
  const t = Math.log(camSunDistAu / P.rampNearAu) / Math.log(P.rampFarAu / P.rampNearAu);
  return P.rampFarLift ** t;
}
