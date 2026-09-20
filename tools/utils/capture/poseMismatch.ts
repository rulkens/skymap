import type { CameraPose } from '../../../src/@types/camera/CameraPose';

type OrbitPose = Pick<CameraPose, 'yaw' | 'pitch' | 'distance'>;
type PoseField = 'yaw' | 'pitch' | 'distance';

const YAW_TOLERANCE_RAD = 1e-3;
const PITCH_TOLERANCE_RAD = 1e-3;
const DISTANCE_RELATIVE_TOLERANCE = 1e-3;

// A framed pose is re-applied after the focus fly-in re-settles; yaw wraps
// (a full turn away is the same shot), and framed spacecraft distances run
// ~1e-22 Mpc, where any absolute distance tolerance would pass every card.
export function poseMismatch(requested: OrbitPose, live: OrbitPose): readonly PoseField[] {
  const mismatches: PoseField[] = [];
  const twoPi = 2 * Math.PI;
  let yawDiff = (requested.yaw - live.yaw) % twoPi;
  if (yawDiff > Math.PI) yawDiff -= twoPi;
  if (yawDiff < -Math.PI) yawDiff += twoPi;
  if (Math.abs(yawDiff) > YAW_TOLERANCE_RAD) mismatches.push('yaw');

  if (Math.abs(requested.pitch - live.pitch) > PITCH_TOLERANCE_RAD) mismatches.push('pitch');

  const relativeDistanceError =
    Math.abs(requested.distance - live.distance) / Math.abs(requested.distance);
  if (relativeDistanceError > DISTANCE_RELATIVE_TOLERANCE) mismatches.push('distance');

  return mismatches;
}
