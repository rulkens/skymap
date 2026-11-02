/**
 * framingPose — the one pose every focus arrival frames its subject to: target
 * and distance from `focusFraming`, orientation kept from `from` (a focus
 * changes what you look at, not which way you face). Roll is not carried: a
 * focus lands level, as the focus tween always has.
 */

import { focusFraming } from './focusFraming';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { FramingWindow } from '../../../@types/camera/FramingWindow';

export function framingPose(
  row: SelectionRow,
  framing: FramingWindow,
  from: CameraPose,
): CameraPose {
  const { target, distance } = focusFraming(row, framing);
  return { target, yaw: from.yaw, pitch: from.pitch, distance };
}
