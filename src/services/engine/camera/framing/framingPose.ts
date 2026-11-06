/**
 * framingPose — the one pose every focus arrival frames its subject to: target
 * and distance from `arrivalFraming` over the kind's focus facts, orientation kept
 * from `from` (a focus changes what you look at, not which way you face). Roll is
 * not carried: a focus lands level, as the focus tween always has.
 */

import { arrivalFraming } from './arrivalFraming';
import { selectionKindOf } from '../../selection/selectionKindOf';
import type { CameraPose } from '../../../../@types/camera/pose/CameraPose';
import type { SelectionRowBase } from '../../../../@types/engine/selection/SelectionRowBase';
import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';

export function framingPose(row: SelectionRowBase, fovYRad: number, from: CameraPose): CameraPose {
  const { focus } = selectionKindOf(row.type);
  // Unreachable by construction: the focus tween and navigate sagas drop an unfocusable row.
  if (focus === null) {
    throw new Error(`framingPose: a ${row.type} row has no focus target`);
  }
  // A kind with a focus places its rows (`SelectionKindFacts.focus`).
  const { target, distance } = arrivalFraming(row as PlacedRow, focus, fovYRad);
  return { target, yaw: from.yaw, pitch: from.pitch, distance };
}
