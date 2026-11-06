/**
 * framingPose — the one pose every focus arrival frames its subject to: target
 * and distance from `arrivalFor` over the kind's focus facts, orientation kept
 * from `from` (a focus changes what you look at, not which way you face). Roll is
 * not carried: a focus lands level, as the focus tween always has.
 */

import { arrivalFor } from './arrivalFor';
import type { CameraPose } from '../../../../@types/camera/pose/CameraPose';
import type { SelectionRowBase } from '../../../../@types/engine/selection/SelectionRowBase';

export function framingPose(row: SelectionRowBase, fovYRad: number, from: CameraPose): CameraPose {
  // An unfocusable row throws, unreachably: the focus tween and navigate sagas drop one first.
  const { target, distance } = arrivalFor(row, fovYRad);
  return { target, yaw: from.yaw, pitch: from.pitch, distance };
}
