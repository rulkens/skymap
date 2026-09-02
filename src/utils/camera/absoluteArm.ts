/**
 * absoluteArm — tag a world-arm `CameraPose` as the absolute frame.
 *
 * The single constructor for the `frame: 'absolute'` arm, so every world-arm
 * producer (drivers, the wheel commit, bootstrap) spells the wrapper one way
 * and `commitCameraPose` keeps exactly one writer (spec §7).
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';

export function absoluteArm(pose: CameraPose): FramedCameraPose {
  return { frame: 'absolute', pose };
}
