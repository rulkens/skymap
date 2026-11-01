import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { FocusMotion } from '../../../@types/camera/FocusMotion';
import { geodesicPath } from '../../../utils/camera/geodesicPath';

/** geodesicDurationMs — the Geodesic focus move's length, from its arc length and the frozen tuning. */
export function geodesicDurationMs(
  d: CameraTweenDescriptor & { motion: Extract<FocusMotion, { style: 'geodesic' }> },
): number {
  return geodesicPath(d.from, d.to, d.motion.fovYRad, d.motion.tuning).durationMs;
}
