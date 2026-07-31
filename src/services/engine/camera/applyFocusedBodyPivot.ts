/**
 * applyFocusedBodyPivot — re-centre a produced pose on the focused body.
 *
 * The unifying rule for body focus: the focused body owns the PIVOT (the pose's
 * `target`, resolved by `focusedBodyPivot`), while whichever driver won the frame
 * owns the ORBIT terms (yaw / pitch / distance). Rather than teach every orbit
 * driver to read the body snapshot, the driver table produces a pose as usual and
 * the frame loop pins its target here, in one place.
 *
 * Applied only for drivers that declare `pivotsOnFocusedBody` (orbitDrag,
 * autoRotate, resting — the drivers that author an orbit around a target). clip,
 * tween and followBody keyframe a full path including the target, so they opt out
 * and keep their own target term; followBody's approach interpolates the pivot
 * itself, and an absolute pin would overwrite it every frame.
 *
 * The pin is IDEMPOTENT and ABSOLUTE — it SETS the target to the pivot, never
 * adds a delta to the existing target — so it can never double-apply across a
 * commit-on-edge boundary. A one-frame-stale `base.target` baked on an edge is
 * simply overwritten by the next frame's pin, never accumulated.
 *
 * The pivot is a fresh per-frame array (read-only downstream), so no defensive
 * copy is needed.
 */

import { focusedBodyPivot } from './focusedBodyPivot';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { Vec3 } from '../../../@types/math/Vec3';

export function applyFocusedBodyPivot(
  pose: CameraPose,
  pivotsOnFocusedBody: boolean,
  focusRow: SelectionRow | null,
  simDays: number,
  panOffset: Vec3,
): CameraPose {
  if (!pivotsOnFocusedBody) return pose;
  const pivot = focusedBodyPivot(focusRow, simDays, panOffset);
  if (pivot === null) return pose;
  return {
    target: pivot,
    yaw: pose.yaw,
    pitch: pose.pitch,
    distance: pose.distance,
  };
}
