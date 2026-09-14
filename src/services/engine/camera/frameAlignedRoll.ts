/**
 * frameAlignedRoll — the world-arm frame transition (rulings 8 + 10): the roll TARGET is
 * the ONE reference field (`blendedUpDir` on `bodyUpWeight`'s band, read in the image plane),
 * and each driven notch applies the ONE settle discipline (`riddenOrientStepRad`). At the
 * engage flip both arms' targets are the same function of altitude, making the zoom pop
 * unrepresentable; above the band the target is the scene up and the formula reduces to the
 * singular-locus drain, at the ruled cost of arrival roll on at-rest notches. `logZoom` is the
 * zoom the CALLER's pivot spent, except where the envelope pins (`zoomedDistance` scales
 * ALTITUDE, so no pose ratio recovers it), and with `rideBoundRad` bounds one notch's turn.
 */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraTuning } from '../../../@types/camera/CameraTuning';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import { ORIENT_DECAY } from '../../../data/camera/orientDecay';
import { blendedUpDir } from '../../../utils/camera/blendedUpDir';
import { bodyUpWeight } from '../../../utils/camera/bodyUpWeight';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { frameUp } from '../../../utils/camera/frameUp';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { riddenOrientStepRad } from '../../../utils/camera/riddenOrientStepRad';
import { rollFromScreenUp } from '../../../utils/camera/rollFromScreenUp';
import { normalize3 } from '../../../utils/math/normalize3';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import { wrapRad } from '../../../utils/math/wrapRad';
import { nearestBodyHR } from './nearestBodyHR';

/**
 * The field-defined roll target at this pose; `null` when no target exists
 * (empty roster, forward down the frame pole — roll itself is undefined
 * there — or the field degenerate with nothing to carry): callers hold the
 * roll. The pose's own screen-up is the hold-and-transport carry, so inside
 * the singular neighbourhood the target IS the current roll and the settle
 * is inert. Exported for the camera debug readout, the one other consumer.
 */
export function bandRollTarget(
  pose: CameraPose,
  bodyStates: ReadonlyMap<BodyId, BodyState>,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
  tuning: CameraTuning,
): number | null {
  const eyeMpc = eyeMpcOf(pose, poseBasis);
  const nearest = nearestBodyHR(eyeMpc, bodyStates);
  if (nearest === null) return null;

  const forward = normalize3([
    pose.target[0] - eyeMpc[0],
    pose.target[1] - eyeMpc[1],
    pose.target[2] - eyeMpc[2],
  ]);
  const upRef = frameUp(upBasis);
  const upVert = upRef[0] * forward[0] + upRef[1] * forward[1] + upRef[2] * forward[2];
  const upPlaneSq =
    upRef[0] * upRef[0] + upRef[1] * upRef[1] + upRef[2] * upRef[2] - upVert * upVert;
  if (upPlaneSq < 1e-18) return null; // forward ∥ frame pole: roll is undefined
  const pole = rotateVec3ByTightMat3([0, 0, 1], nearest.bodyState.orientation);
  const carry = imagePlaneBasis(forward, pose.roll ?? 0, upRef).up;
  const dir = blendedUpDir(forward, pole, bodyUpWeight(nearest.hr, tuning), upRef, carry);
  if (dir === null) return null;
  return rollFromScreenUp(forward, dir, upRef);
}

export function frameAlignedRoll(
  prePose: CameraPose,
  postPose: CameraPose,
  bodyStates: ReadonlyMap<BodyId, BodyState>,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
  logZoom: number,
  tuning: CameraTuning,
): number {
  const currentRoll = postPose.roll ?? 0;
  // Ruling 11: north-up off switches the roll authority off whole —
  // same gate the engaged heading/level settles read (one home).
  if (!tuning.northUp) return currentRoll;
  const tPre = bandRollTarget(prePose, bodyStates, poseBasis, upBasis, tuning);
  const tNew = bandRollTarget(postPose, bodyStates, poseBasis, upBasis, tuning);
  if (tPre === null || tNew === null) return currentRoll;
  // Deviation vs the PRE-notch target decays; the deviation's own movement
  // (the notch's authored target swing) rides — one shared discipline.
  const dPre = wrapRad(currentRoll - tPre);
  const dNewRaw = wrapRad(currentRoll - tNew);
  return (
    currentRoll -
    riddenOrientStepRad(dPre, wrapRad(dNewRaw - dPre), ORIENT_DECAY.rideBoundRad, logZoom)
  );
}
