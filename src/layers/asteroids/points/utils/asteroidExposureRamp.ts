import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidTuning } from '../../@types/AsteroidTuning';

/**
 * Display lift on a class's dots' flux by the camera's zoom (its distance to the orbit target, in AU):
 * a dot near what you frame sits ~zoom away, so a lift ∝ zoom² holds its apparent brightness as you
 * zoom (cf. `starExposureRamp`: a monitor can't dark-adapt). Clamped to the floor, so a camera framing
 * Earth still sees the belt, and to the class's cap, past which its dots overlap and a flat lift holds
 * the field's surface brightness instead. The distant class's sparse ring overlaps far later.
 */
export function asteroidExposureRamp(
  zoomAu: number,
  cls: AsteroidClass,
  lift: Pick<
    AsteroidTuning,
    'liftPerAu2' | 'liftFloorZoomAu' | 'liftCapZoomAu' | 'distantLiftCapZoomAu'
  >,
): number {
  const cap = cls === 'distant' ? lift.distantLiftCapZoomAu : lift.liftCapZoomAu;
  const z = Math.min(Math.max(zoomAu, lift.liftFloorZoomAu), cap);
  return lift.liftPerAu2 * z * z;
}
