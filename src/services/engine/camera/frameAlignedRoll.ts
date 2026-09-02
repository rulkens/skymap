/**
 * frameAlignedRoll — the world-arm half of the frame transition (ruling 8):
 * per at-rest wheel notch, the pose's roll decays toward the value that puts
 * the nearest body's spin axis up on screen, by the same `orientStepRad`
 * decay scaled by the same altitude-keyed curve — `maxTiltRad` rises
 * smoothly from 0 at the band's top (h/R 3.4), so the alignment fades in
 * over the band and hands off to the engaged settles already converging. No
 * new constants, no second blend mechanism ("same lerp").
 */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import { SURFACE_REGIME } from '../../../data/camera/surfaceRegime';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { frameUp } from '../../../utils/camera/frameUp';
import { maxTiltRad } from '../../../utils/camera/maxTiltRad';
import { orientStepRad } from '../../../utils/camera/orientStepRad';
import { rollFromScreenUp } from '../../../utils/camera/rollFromScreenUp';
import { normalize3 } from '../../../utils/math/normalize3';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import { nearestBodyHR } from './nearestBodyHR';

export function frameAlignedRoll(
  pose: CameraPose,
  bodyStates: ReadonlyMap<BodyId, BodyState>,
  poseBasis: Readonly<Mat3>,
  upBasis: Readonly<Mat3>,
): number {
  const currentRoll = pose.roll ?? 0;
  const eyeMpc = eyeMpcOf(pose, poseBasis);

  // The regime predicate's own roster rule decides which body owns the
  // approach — one home (`nearestBodyHR`), so the two can never disagree.
  const nearest = nearestBodyHR(eyeMpc, bodyStates);
  if (nearest === null) return currentRoll;
  const authority = maxTiltRad(nearest.hr) / SURFACE_REGIME.tiltMaxRad;
  if (authority <= 0) return currentRoll;

  const forward = normalize3([
    pose.target[0] - eyeMpc[0],
    pose.target[1] - eyeMpc[1],
    pose.target[2] - eyeMpc[2],
  ]);
  const poleWorld = rotateVec3ByTightMat3([0, 0, 1], nearest.bodyState.orientation);
  // The pole's image-plane part is the "north up" screen-up target; a view
  // straight down the spin axis has no such direction and keeps its roll.
  const vert = forward[0] * poleWorld[0] + forward[1] * poleWorld[1] + forward[2] * poleWorld[2];
  const horiz: Vec3 = [
    poleWorld[0] - forward[0] * vert,
    poleWorld[1] - forward[1] * vert,
    poleWorld[2] - forward[2] * vert,
  ];
  if (Math.hypot(...horiz) < 1e-9) return currentRoll;

  const desiredRoll = rollFromScreenUp(forward, normalize3(horiz), frameUp(upBasis));
  const wrapped = Math.atan2(
    Math.sin(desiredRoll - currentRoll),
    Math.cos(desiredRoll - currentRoll),
  );
  return currentRoll + orientStepRad(wrapped) * authority;
}
