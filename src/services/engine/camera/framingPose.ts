/**
 * framingPose — the one pose every focus arrival frames its subject to: target
 * and distance from `focusFraming`, orientation kept from `from` (a focus
 * changes what you look at, not which way you face). Roll is not carried: a
 * focus lands level, as the focus tween always has.
 */

import { focusFraming } from './focusFraming';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { CameraPose } from '../../../@types/camera/CameraPose';

export function framingPose(row: SelectionRow, fovYRad: number, from: CameraPose): CameraPose {
  const { target, distance } = focusFraming(row, fovYRad);
  return { target, yaw: from.yaw, pitch: from.pitch, distance };
}
