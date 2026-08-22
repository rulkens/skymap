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
 * Only a MOVING focus is pinned (`bodyMovesThisFrame`). A static focus — the
 * Sun, a famous star — has a snapshot position but no orbit to chase, so
 * gating on presence instead would hand it the pin, and with it `panOffset`,
 * for a body that never needed re-centring.
 *
 * The pin is IDEMPOTENT and ABSOLUTE — it SETS the target to `bodyPosition +
 * panOffset`, never adds a delta to the existing target — so it can never
 * double-apply across a commit-on-edge boundary. A one-frame-stale `base.target`
 * baked on an edge is simply overwritten by the next frame's pin, never accumulated.
 *
 * `panOffset` is the strafe the user has panned away from the body (zero on a
 * fresh focus): world-frame while surface-fixed follow is disengaged, but
 * ground-fixed (co-rotated with the body every engaged frame — `runFrame`'s
 * engaged block, `rotateFollowPan`) while it is engaged, so a held ground
 * point stays put under the camera instead of sliding at ω × pan. Resolving
 * `bodyPosition + panOffset` here keeps the pivot a SINGLE target-resolution
 * home — the strafe is stored on the clock and only READ here, never a
 * second per-driver target path.
 *
 * The result target is a fresh per-frame array (read-only downstream), so no
 * defensive copy of the snapshot position is needed.
 */

import { liveBodyPosition } from './liveBodyPosition';
import { bodyMovesThisFrame } from '../../../utils/scene/bodyMovesThisFrame';
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
  if (!bodyMovesThisFrame(focusRow)) return pose;
  const pivot = liveBodyPosition(focusRow, simDays);
  // A moving body is in the snapshot by construction; the guard is the narrowing.
  if (pivot === null) return pose;
  return {
    target: [pivot[0] + panOffset[0], pivot[1] + panOffset[1], pivot[2] + panOffset[2]],
    yaw: pose.yaw,
    pitch: pose.pitch,
    distance: pose.distance,
  };
}
