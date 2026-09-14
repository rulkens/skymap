/**
 * flatFramedPose — a framed pose as the flat number row a golden trace records.
 * Arm-dependent width (7 world-arm terms vs 15 body-arm ones) is the point: a
 * trace step that changed arm cannot compare clean against one that did not.
 */

import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';

export function flatFramedPose(framed: FramedCameraPose): readonly number[] {
  if (framed.frame !== 'absolute') {
    const { anchorLocalM, eyeRelAnchorM, basisLocal } = framed.pose;
    return [...anchorLocalM, ...eyeRelAnchorM, ...basisLocal];
  }
  const { target, yaw, pitch, distance, roll } = framed.pose;
  return [...target, yaw, pitch, distance, roll ?? 0];
}
