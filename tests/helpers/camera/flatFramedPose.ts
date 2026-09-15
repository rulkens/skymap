/**
 * flatFramedPose — a framed pose as the flat number row a golden trace records.
 * Arm-dependent width (7 world-arm terms, 15 body-arm ones, 3 on a site) is the
 * point: a trace step that changed arm cannot compare clean against one that did not.
 */

import { isBodyArm } from '../../../src/services/engine/camera/rungs/isBodyArm';
import { isWorldArm } from '../../../src/services/engine/camera/rungs/isWorldArm';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';

export function flatFramedPose(framed: FramedCameraPose): readonly number[] {
  if (isBodyArm(framed)) {
    const { anchorLocalM, eyeRelAnchorM, basisLocal } = framed.pose;
    return [...anchorLocalM, ...eyeRelAnchorM, ...basisLocal];
  }
  if (!isWorldArm(framed)) {
    const { headingRad, elevationRad, rangeM } = framed.pose;
    return [headingRad, elevationRad, rangeM];
  }
  const { target, yaw, pitch, distance, roll } = framed.pose;
  return [...target, yaw, pitch, distance, roll ?? 0];
}
