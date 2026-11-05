/**
 * framingPose — the one pose every focus arrival frames its subject to: target
 * and distance from `arrivalFraming` over the kind's focus facts, orientation kept
 * from `from` (a focus changes what you look at, not which way you face). Roll is
 * not carried: a focus lands level, as the focus tween always has.
 */

import { arrivalFraming } from './arrivalFraming';
import { selectionKindOf } from '../../../../compositions/selectionKindOf';
import type { SelectionRow } from '../../../../@types/engine/SelectionRow';
import type { CameraPose } from '../../../../@types/camera/pose/CameraPose';

export function framingPose(row: SelectionRow, fovYRad: number, from: CameraPose): CameraPose {
  const { focus } = selectionKindOf(row.type);
  // Unreachable by construction: the focus tween and navigate sagas drop an unfocusable row.
  if (focus === null || !('positionMpc' in row)) {
    throw new Error(`framingPose: a ${row.type} row has no focus target`);
  }
  const { target, distance } = arrivalFraming(row, focus, fovYRad);
  return { target, yaw: from.yaw, pitch: from.pitch, distance };
}
