/**
 * applyFocusedBodyPivot — re-centre a produced pose on the focused body: the body
 * owns the PIVOT (the pose's `target`), the winning driver owns the orbit terms.
 * Applied only for drivers declaring `pivotsOnFocusedBody` — clip and tween
 * keyframe a full path including the target, so they opt out. Only a MOVING focus
 * is pinned: a static one has no orbit to chase, and gating on presence would hand
 * it the pin and with it `panOffset`. The pin SETS `bodyPosition + panOffset`
 * rather than adding a delta, so it cannot double-apply across a commit-on-edge
 * boundary.
 */

import { liveBodyPosition } from './liveBodyPosition';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { bodyMovesThisFrame } from '../../../utils/scene/bodyMovesThisFrame';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { Vec3 } from '../../../@types/math/Vec3';

export function applyFocusedBodyPivot(
  framed: FramedCameraPose,
  pivotsOnFocusedBody: boolean,
  focusRow: SelectionRow | null,
  bodies: ReadonlyMap<string, BodyState>,
  panOffset: Vec3,
): FramedCameraPose {
  // A body arm co-rotates with its body, so "keep the moving body centred" is
  // structurally satisfied and the pin has nothing to do (spec §7 step 4).
  if (framed.frame !== 'absolute') return framed;
  if (!pivotsOnFocusedBody) return framed;
  if (!bodyMovesThisFrame(focusRow)) return framed;
  const pivot = liveBodyPosition(focusRow, bodies);
  // A moving body is in the snapshot by construction; the guard is the narrowing.
  if (pivot === null) return framed;
  const pose = framed.pose;
  return absoluteArm({
    target: [pivot[0] + panOffset[0], pivot[1] + panOffset[1], pivot[2] + panOffset[2]],
    yaw: pose.yaw,
    pitch: pose.pitch,
    distance: pose.distance,
    roll: pose.roll,
  });
}
