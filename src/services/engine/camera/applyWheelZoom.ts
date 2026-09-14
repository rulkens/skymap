/**
 * applyWheelZoom — the at-rest wheel notch as a pose to commit, for the case
 * where `camera.base` IS what the frame renders; a notch a following camera
 * swallows goes to that driver instead. The spin epoch restarts on any base
 * change, so committing an un-spun base pops the yaw — zoom the spun pose.
 */

import { spinAutoRotate } from './spinAutoRotate';
import { zoomedPose } from '../../../utils/camera/zoomedPose';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { PivotFraming } from '../../../@types/camera/PivotFraming';

export function applyWheelZoom(args: {
  readonly base: FramedCameraPose;
  readonly factor: number;
  /** `owns` = the spin authored the pose last frame, not merely enabled. */
  readonly spin: { readonly owns: boolean; readonly rate: number };
  readonly spinElapsedMs: number;
  readonly pivot: PivotFraming;
}): CameraPose | null {
  const { base, factor, spin, spinElapsedMs, pivot } = args;
  // World arm only (spec §7): in a body arm the wheel routes to the surface gesture.
  if (base.frame !== 'absolute') return null;
  const pose = spin.owns ? spinAutoRotate(base.pose, spin.rate, spinElapsedMs) : base.pose;
  return zoomedPose(pose, factor, pivot);
}
