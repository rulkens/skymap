/**
 * The single constructor for the `frame: 'absolute'` arm — one spelling for
 * every world-arm producer, one writer in `commitCameraPose` (spec §7).
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { FramedPose } from '../../@types/camera/FramedPose';

export function absoluteArm(pose: CameraPose): FramedPose<'absolute'> {
  return { frame: 'absolute', pose };
}
