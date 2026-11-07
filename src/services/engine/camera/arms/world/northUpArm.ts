/**
 * northUpArm — a world arm with its roll zeroed, so the orientation frame's pole
 * is screen up: the antique look's north-up plate (`StepInputs.northUp`). A body
 * or site arm's roll is its local horizon, not an image roll, so it passes
 * unchanged, as does a world arm already level (both by reference).
 */

import type { FramedCameraPose } from '../../../../../@types/camera/pose/FramedCameraPose';
import { absoluteArm } from '../../../../../utils/camera/arms/absoluteArm';
import { isWorldArm } from './isWorldArm';

export function northUpArm(framed: FramedCameraPose): FramedCameraPose {
  if (!isWorldArm(framed) || (framed.pose.roll ?? 0) === 0) return framed;
  return absoluteArm({ ...framed.pose, roll: 0 });
}
