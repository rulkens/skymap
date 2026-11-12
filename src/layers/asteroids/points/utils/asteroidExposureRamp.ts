import { ASTEROID_PHOTOMETRY as P } from '../data/asteroidPhotometry';

/**
 * Display lift on the dots' flux by the camera's zoom (its distance to the orbit target, in AU): a dot
 * near what you frame sits ~zoom away, so a lift ∝ zoom² holds its apparent brightness as you zoom
 * (cf. `starExposureRamp`: a monitor can't dark-adapt). Clamped to `liftFloorZoomAu`, so a camera
 * framing Earth still sees the belt, and to `liftCapZoomAu`, past which the dots overlap and a flat lift
 * holds the field's surface brightness instead.
 */
export function asteroidExposureRamp(zoomAu: number): number {
  const z = Math.min(Math.max(zoomAu, P.liftFloorZoomAu), P.liftCapZoomAu);
  return P.liftPerAu2 * z * z;
}
