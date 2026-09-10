/**
 * applyWheelZoom — the at-rest wheel notch as a pose to commit, for the case
 * where `camera.base` IS what the frame renders. A notch a following camera
 * would swallow never reaches here: the caller routes it to the follow driver.
 *
 * The autoRotate spin epoch restarts on any base-identity change, so
 * committing an un-spun base pops the yaw — zoom the already-spun pose. With
 * the spin merely enabled but not authoring, the caller hands in 0 elapsed and
 * this degenerates to the plain base exactly.
 */

import { spinAutoRotate } from './spinAutoRotate';
import { zoomedPose } from '../../../utils/camera/zoomedPose';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { PivotFraming } from '../../../@types/camera/PivotFraming';

export function applyWheelZoom(args: {
  readonly base: FramedCameraPose;
  readonly factor: number;
  readonly autoRotate: { readonly active: boolean; readonly rate: number };
  readonly autoRotateElapsedMs: number;
  readonly pivot: PivotFraming;
}): CameraPose | null {
  const { base, factor, autoRotate, autoRotateElapsedMs, pivot } = args;
  // World arm only (spec §7): in a body arm the wheel routes to the surface gesture.
  if (base.frame !== 'absolute') return null;
  const pose = autoRotate.active
    ? spinAutoRotate(base.pose, autoRotate.rate, autoRotateElapsedMs)
    : base.pose;
  return zoomedPose(pose, factor, pivot);
}
