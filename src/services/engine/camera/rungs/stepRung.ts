/**
 * The regime step (spec §2.5): a frame at most ONE rung away (§2.6.4). The tag
 * IS the regime, so hysteresis needs no memory — which cell gets asked already
 * encodes which side of the band the camera is on.
 */

import type { ClimbRow } from '../../../../@types/camera/ClimbRow';
import type { ClimbableKind } from '../../../../@types/camera/ClimbableKind';
import type { FramedCameraPose } from '../../../../@types/camera/FramedCameraPose';
import type { FramedPose } from '../../../../@types/camera/FramedPose';
import type { ParentOf } from '../../../../@types/camera/ParentOf';
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungCtx } from '../../../../@types/camera/RungCtx';
import { CAMERA_RUNGS } from './cameraRungs';
import { climbRowFor } from './climbRowFor';
import { isWorldArm } from './isWorldArm';
import { rungKindOf } from './rungKindOf';

export function stepRung(current: FramedCameraPose, ctx: RungCtx): PoseFrame {
  if (!isWorldArm(current)) {
    const row = climbRowFor(current.frame);
    // The parent FRAME, not the parent kind: a site's parent names its host
    // planet, which only the row can resolve. The conversion is the disengage.
    if (row.release(current, ctx)) return row.toParent(current, ctx).frame;
  }
  for (const row of Object.values(CAMERA_RUNGS)) {
    if (!('parent' in row) || row.parent !== rungKindOf(current.frame)) continue;
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
