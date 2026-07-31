/**
 * focusedBodyPivot — where the camera orbits when a scene body holds focus: the
 * body's live world position plus `panOffset`, the world-frame strafe the user
 * has panned away from it (zero on a fresh focus).
 *
 * The single home for that sum. Two callers need it because they resolve it
 * differently, not because they compute it differently: `applyFocusedBodyPivot`
 * PINS it onto whichever orbit driver won the frame, while `followBody` READS it
 * as the endpoint of its own approach glide (it opts out of the pin so it can
 * interpolate the pivot rather than have it overwritten every frame).
 *
 * Null when the focus is not a body present in this frame's snapshot. The
 * returned array is fresh per call, so callers may hand it downstream as-is.
 */

import { liveBodyPosition } from './liveBodyPosition';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { Vec3 } from '../../../@types/math/Vec3';

export function focusedBodyPivot(
  focusRow: SelectionRow | null,
  simDays: number,
  panOffset: Vec3,
): Vec3 | null {
  const pos = liveBodyPosition(focusRow, simDays);
  if (pos === null) return null;
  return [pos[0] + panOffset[0], pos[1] + panOffset[1], pos[2] + panOffset[2]];
}
