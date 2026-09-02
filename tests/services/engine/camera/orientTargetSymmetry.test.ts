/**
 * orientTargetSymmetry — ruling 10: ONE reference field. The world arm's roll
 * target and the engaged settle's blended north must be the SAME function of
 * altitude — a nadir view's image plane IS the standpoint's horizontal plane,
 * so the two constructions are directly comparable there. The target reads
 * only the pose (no direction input), so equality across arms is what makes
 * an in/out discrepancy unrepresentable. Fails if either arm re-grows its own
 * curve (the pre-round-8 seam: world authority ≈ 0.53 vs engaged weight 1 at
 * the engage flip, a ~0.12 rad pop walked out by the decay).
 */

import { describe, it, expect } from 'vitest';

import { bandRollTarget } from '../../../../src/services/engine/camera/frameAlignedRoll';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { blendedEnuAt } from '../../../../src/utils/camera/blendedEnuAt';
import { bodyUpWeight } from '../../../../src/utils/camera/bodyUpWeight';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { rotateVec3ByTightMat3T } from '../../../../src/utils/math/rotateVec3ByTightMat3T';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const BODIES = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
const EARTH = BODIES.get('earth')!;
const R_MPC = SCENE_EARTH.radiusM * SCALE_UNITS.M_TO_MPC;
const UP_REF = frameUp(B);

/** Nadir view from h/R over Earth; the standpoint comes from yaw/pitch. */
function poseAtHR(hr: number, yaw: number, pitch: number): CameraPose {
  return {
    target: [EARTH.positionMpc[0]!, EARTH.positionMpc[1]!, EARTH.positionMpc[2]!],
    yaw,
    pitch,
    distance: R_MPC * (1 + hr),
    roll: 0,
  };
}

function angleBetween(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  const d = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

// Altitudes spanning below-engage (transient crossing notches), the whole
// hysteresis window, and above-band; generic standpoints off the singular
// locus (the hold zone is path-dependent by design and not comparable here).
const HRS = [0.8, 1.3, 1.75, 2.0, 2.4, 2.8, 3.2, 3.39, 3.6, 5.0];
const STANDPOINTS = [
  { yaw: 0.7, pitch: 0.3 },
  { yaw: -1.2, pitch: 0.6 },
  { yaw: 2.1, pitch: -0.4 },
];

describe('orientation-target symmetry (ruling 10)', () => {
  it.each(STANDPOINTS)('world and engaged targets agree at every altitude (yaw %j)', (sp) => {
    for (const hr of HRS) {
      const pose = poseAtHR(hr, sp.yaw, sp.pitch);
      const target = bandRollTarget(pose, BODIES, B, B);
      expect(target).not.toBeNull();

      const eye = eyeMpcOf(pose, B);
      const forward = normalize3([
        pose.target[0]! - eye[0]!,
        pose.target[1]! - eye[1]!,
        pose.target[2]! - eye[2]!,
      ] as Vec3);
      const worldUp = [...imagePlaneBasis(forward, target!, UP_REF).up] as Vec3;

      // The engaged settle's reference north at the SAME standpoint/altitude,
      // built in body axes and rotated back to world.
      const luWorld = normalize3([-forward[0]!, -forward[1]!, -forward[2]!] as Vec3);
      const luBody = rotateVec3ByTightMat3T(luWorld, EARTH.orientation);
      const sceneUpBody = rotateVec3ByTightMat3T(UP_REF, EARTH.orientation);
      const { north } = blendedEnuAt(luBody, bodyUpWeight(hr), sceneUpBody, null);
      const engagedUp = rotateVec3ByTightMat3(north, EARTH.orientation);

      expect(angleBetween(worldUp, engagedUp)).toBeLessThan(1e-6);
    }
  });
});
