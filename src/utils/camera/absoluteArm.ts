/**
 * The single constructor for the `frame: 'absolute'` arm — one spelling for
 * every world-arm producer, one writer in `commitCameraPose` (spec §7).
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';

export function absoluteArm(pose: CameraPose): FramedCameraPose {
  return { frame: 'absolute', pose };
}
