/**
 * frameAlignedRoll — the world-arm frame-transition blend (ruling 8).
 *
 * Angle assertions only: roll is O(1) whatever the heliocentric magnitudes,
 * so real Earth at J2000 is an honest fixture here (the blind-assertion trap
 * is positional).
 */

import { describe, it, expect } from 'vitest';

import { frameAlignedRoll } from '../../../../src/services/engine/camera/frameAlignedRoll';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { ORIENT_DECAY } from '../../../../src/data/camera/orientDecay';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const BODIES = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
const EARTH = BODIES.get('earth')!;

/** Eye at h/R over Earth, looking at its centre, with the given roll. */
function poseAtHR(hr: number, roll: number): CameraPose {
  return {
    target: [EARTH.positionMpc[0]!, EARTH.positionMpc[1]!, EARTH.positionMpc[2]!],
    yaw: 0.7,
    pitch: 0.3,
    distance: SCENE_EARTH.radiusM * (1 + hr) * SCALE_UNITS.M_TO_MPC,
    roll,
  };
}

/** Angle between the pose's screen-up and Earth's pole in the image plane. */
function poleUpOffset(pose: CameraPose): number {
  const eye = eyeMpcOf(pose, B);
  const forward = normalize3([
    pose.target[0]! - eye[0]!,
    pose.target[1]! - eye[1]!,
    pose.target[2]! - eye[2]!,
  ] as Vec3);
  const { up } = imagePlaneBasis(forward, pose.roll ?? 0, frameUp(B));
  const pole = rotateVec3ByTightMat3([0, 0, 1], EARTH.orientation);
  const vert = forward[0]! * pole[0]! + forward[1]! * pole[1]! + forward[2]! * pole[2]!;
  const horiz = normalize3([
    pole[0]! - forward[0]! * vert,
    pole[1]! - forward[1]! * vert,
    pole[2]! - forward[2]! * vert,
  ] as Vec3);
  const dot = up[0]! * horiz[0]! + up[1]! * horiz[1]! + up[2]! * horiz[2]!;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

describe('frameAlignedRoll', () => {
  it('walks screen-up onto the body pole inside the band, capped per notch', () => {
    let pose = poseAtHR(0.5, 1.4);
    const before = poleUpOffset(pose);
    expect(before).toBeGreaterThan(0.5); // the fixture really is misaligned
    for (let i = 0; i < 80; i += 1) {
      const roll = frameAlignedRoll(pose, BODIES, B, B);
      expect(Math.abs(roll - (pose.roll ?? 0))).toBeLessThanOrEqual(ORIENT_DECAY.capRad + 1e-12);
      pose = { ...pose, roll };
    }
    expect(poleUpOffset(pose)).toBeLessThan(0.01);
  });

  it('is inert above the band — the scene frame keeps the view out there', () => {
    const pose = poseAtHR(5, 1.4);
    expect(frameAlignedRoll(pose, BODIES, B, B)).toBe(1.4);
  });

  it('fades in over the band: near its top a notch aligns almost nothing', () => {
    // The smoothstep authority is what makes the onset a blend and not a
    // trigger at h/R 3.4 — the step near the top must be a small fraction of
    // the step deep inside the band, for the same large residual.
    const topStep = Math.abs(frameAlignedRoll(poseAtHR(3.3, 1.4), BODIES, B, B) - 1.4);
    const deepStep = Math.abs(frameAlignedRoll(poseAtHR(0.5, 1.4), BODIES, B, B) - 1.4);
    expect(deepStep).toBeGreaterThan(0.05);
    expect(topStep).toBeLessThan(0.05 * deepStep);
  });
});
