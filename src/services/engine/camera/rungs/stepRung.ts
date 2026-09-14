/**
 * The regime step (spec §2.5): ask this rung's `release`, then each child's
 * `engage`, and answer a frame at most ONE rung away (§2.6.4). The tag IS the
 * regime, so hysteresis needs no memory — which cell gets asked already
 * encodes which side of the band the camera is on.
 */

import type { FramedCameraPose } from '../../../../@types/camera/FramedCameraPose';
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungCtx } from '../../../../@types/camera/RungCtx';
import { CAMERA_RUNGS } from './cameraRungs';
import { climbRowFor } from './climbRowFor';
import { isWorldArm } from './isWorldArm';
import { rungKindOf } from './rungKindOf';

export function stepRung(current: FramedCameraPose, ctx: RungCtx): PoseFrame {
  if (!isWorldArm(current)) {
    const row = climbRowFor(current.frame);
    // A parent kind reads as a frame only while the world arm is every child's
    // parent. Falling through rather than answering `current.frame` is what
    // lets a rung parented on THIS one engage at all (§2.6.4).
    if (row.release(current, ctx)) return row.parent;
  }
  for (const row of Object.values(CAMERA_RUNGS)) {
    // The world-arm narrowing TS needs, restated: today every child hangs off
    // the world arm, so a rung parented on a body stops typechecking here.
    if (!('parent' in row) || !isWorldArm(current) || row.parent !== rungKindOf(current.frame)) {
      continue;
    }
    const engaged = row.engage(current, ctx);
    if (engaged !== null) return engaged;
  }
  return current.frame;
}
