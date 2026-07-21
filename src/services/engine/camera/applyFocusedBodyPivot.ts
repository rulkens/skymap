/**
 * applyFocusedBodyPivot — re-centre a produced pose on the focused body.
 *
 * The unifying rule for body focus: the focused body owns the PIVOT (the pose's
 * `target`), while whichever driver won the frame owns the ORBIT terms
 * (yaw / pitch / distance). Rather than teach every orbit driver to read the
 * body snapshot, the driver table produces a pose as usual and the frame loop
 * pins its target to the live body position here, in one place.
 *
 * Applied only for drivers that declare `pivotsOnFocusedBody` (orbitDrag,
 * autoRotate, followBody, resting — the drivers that author an orbit around a
 * target). clip and tween keyframe a full path including the target, so they
 * opt out and keep their own target term.
 *
 * The pin is IDEMPOTENT and ABSOLUTE — it SETS the target to the body position,
 * never adds a delta — so it can never double-apply across a commit-on-edge
 * boundary. A one-frame-stale `base.target` baked on an edge is simply overwritten
 * by the next frame's pin, never accumulated.
 *
 * `pivot` aliases the live per-frame snapshot array (fresh + read-only downstream),
 * matching how `followBody` already aliases it — no defensive copy needed.
 */

import { focusedBodyPosition } from './focusedBodyPosition';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';

export function applyFocusedBodyPivot(
  pose: CameraPose,
  pivotsOnFocusedBody: boolean,
  focusRow: SelectionRow | null,
  simDays: number,
): CameraPose {
  if (!pivotsOnFocusedBody) return pose;
  const pivot = focusedBodyPosition(focusRow, simDays);
  if (pivot === null) return pose;
  return { target: pivot, yaw: pose.yaw, pitch: pose.pitch, distance: pose.distance };
}
