/**
 * The regime step (spec §2.5): a frame at most ONE arm away (§2.6.4). The tag
 * IS the regime, so hysteresis needs no memory — which cell gets asked already
 * encodes which side of the band the camera is on.
 */

import type { ClimbRow } from './@types/ClimbRow';
import type { ClimbableKind } from '../@types/ClimbableKind';
import type { FramedCameraPose } from '../../../../@types/camera/pose/FramedCameraPose';
import type { FramedPose } from '../../../../@types/camera/pose/FramedPose';
import type { ParentOf } from './@types/ParentOf';
import type { PoseFrame } from '../../../../@types/camera/pose/PoseFrame';
import type { CameraArmCtx } from '../../../../@types/camera/arms/CameraArmCtx';
import { CAMERA_ARMS } from './cameraArms';
import { climbRowFor } from './climbRowFor';
import { isWorldArm } from './world/isWorldArm';
import { cameraArmKindOf } from './cameraArmKindOf';

export function stepCameraArm(current: FramedCameraPose, ctx: CameraArmCtx): PoseFrame {
  if (!isWorldArm(current)) {
    const row = climbRowFor(current.frame);
    // The parent FRAME, not the parent kind: a site's parent names its host
    // planet, which only the row can resolve. The conversion is the disengage.
    if (row.release(current, ctx)) return row.toParent(current, ctx).frame;
  }
  for (const row of Object.values(CAMERA_ARMS)) {
    if (!('parent' in row) || row.parent !== cameraArmKindOf(current.frame)) continue;
    // The guard above IS the proof the loop value cannot carry: `current` sits
    // in this row's parent frame, which is what `engage` declares (§2.6.3).
    const engaged = (row as ClimbRow<ClimbableKind>).engage(
      current as FramedPose<ParentOf[ClimbableKind]>,
      ctx,
    );
    if (engaged !== null) return engaged;
  }
  return current.frame;
}
