/**
 * centreLookingPose — the commit-side inverse of `approachTiltedPose`
 * (R12-1). The projection holds the eye by moving `target` off the pivot;
 * the pivot pin SETS target and DERIVES the eye — so committing a projected
 * pose teleports the eye by d·2sin(τ/2) on the next pinned frame, and it
 * accumulates over commit→re-derive cycles. Both commit sites bake THIS
 * instead: the pin's own output reconstructed exactly — eye preserved,
 * re-aimed at `body + panOffset` — so `camera.base` stays centre-looking by
 * wiring, and the per-frame projection re-tilts the unchanged image from it.
 * Wherever the projection could not have applied, the input passes by
 * reference (the same gates, so forward and inverse cannot disagree).
 */

import { bodyMovesThisFrame } from '../../../utils/scene/bodyMovesThisFrame';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { hOverR } from './hOverR';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { mappedTiltRad } from '../../../utils/camera/mappedTiltRad';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { normalize3 } from '../../../utils/math/normalize3';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { Vec3 } from '../../../@types/math/Vec3';

export function centreLookingPose(
  framed: FramedCameraPose,
  focusRow: SelectionRow | null,
  simDays: number,
  rememberedTiltRad: number,
  panOffset: Vec3,
  poseBasis: Readonly<Mat3>,
): FramedCameraPose {
  if (framed.frame !== 'absolute' || rememberedTiltRad === 0) return framed;
  if (focusRow === null || focusRow.type !== 'body' || !bodyMovesThisFrame(focusRow)) {
    return framed;
  }
  const bodyState = deriveBodyStates(simDays).get(focusRow.id);
  if (bodyState === undefined) return framed;

  const pose = framed.pose;
  const eye = eyeMpcOf(pose, poseBasis);
  const tau = mappedTiltRad(rememberedTiltRad, hOverR(eye, bodyState, focusRow.radiusM));
  if (tau < 1e-12) return framed; // at/above the band top — projection inert

  const centre = bodyState.positionMpc;
  const pivot: Vec3 = [
    centre[0] + panOffset[0],
    centre[1] + panOffset[1],
    centre[2] + panOffset[2],
  ];
  const to: Vec3 = [pivot[0] - eye[0], pivot[1] - eye[1], pivot[2] - eye[2]];
  const distance = Math.hypot(...to);
  if (distance === 0) return framed;
  const { yaw, pitch } = orbitAnglesLookingAlong(normalize3(to), [...poseBasis] as Mat3);
  return absoluteArm({ target: pivot, yaw, pitch, distance, roll: pose.roll });
}
