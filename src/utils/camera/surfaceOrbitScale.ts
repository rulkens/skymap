import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { GroundRadiusLookup } from '../../@types/camera/GroundRadiusLookup';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { normalize3 } from '../math/normalize3';

/**
 * The factor that turns a screen-radian orbit into a sweep about the body
 * centre that keeps the ground under the eye tracking the drag — the body
 * arm's twin of `orbitRadPerPixel`. A screen angle θ spans ~θ·h of ground
 * (2·tan(fov/2)/fov per radian), which is θ·h/R of rotation; capped at 1, the
 * off-disc orbit's own rate, which the two cross at about one radius up.
 */
export function surfaceOrbitScale(
  arm: BodyFixedPose,
  fovYRad: number,
  groundRadiusAtM: GroundRadiusLookup,
): number {
  const eye = bodyFixedEyeM(arm);
  const groundM = groundRadiusAtM(normalize3(eye));
  const altitudeM = Math.max(Math.hypot(...eye) - groundM, 0);
  const groundPerScreenRad = (2 * Math.tan(fovYRad / 2)) / fovYRad;
  return Math.min(1, (groundPerScreenRad * altitudeM) / groundM);
}
