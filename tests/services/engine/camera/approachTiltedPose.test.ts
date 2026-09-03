/**
 * approachTiltedPose — ruling 13's world-arm tilt expression. Angle
 * assertions only (tilt is O(1) at any heliocentric magnitude); the eye
 * check is a RELATIVE bound for the same reason. The cross-arm symmetry
 * claim: the expressed tilt equals `mappedTiltRad` — the same ONE home the
 * engaged settle converges on — at every altitude, so re-introducing an
 * arm-gated tilt path fails here and in the round-trip sim.
 */

import { describe, it, expect } from 'vitest';

import { approachTiltedPose } from '../../../../src/services/engine/camera/approachTiltedPose';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { mappedTiltRad } from '../../../../src/utils/camera/mappedTiltRad';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const SIM = CONST_J2000;
const EARTH = deriveBodyStates(SIM).get('earth')! as BodyState;
const R_MPC = SCENE_EARTH.radiusM * SCALE_UNITS.M_TO_MPC;

const FOCUS_EARTH: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
  radiusM: SCENE_EARTH.radiusM,
};

function centredPoseAt(hr: number, roll = 0.2): FramedCameraPose {
  return absoluteArm({
    target: [EARTH.positionMpc[0]!, EARTH.positionMpc[1]!, EARTH.positionMpc[2]!],
    yaw: 0.7,
    pitch: 0.3,
    distance: R_MPC * (1 + hr),
    roll,
  });
}

function tiltOf(framed: FramedCameraPose): number {
  if (framed.frame !== 'absolute') throw new Error('absolute expected');
  const pose = framed.pose;
  const eye = eyeMpcOf(pose, B);
  const n = normalize3([
    eye[0]! - EARTH.positionMpc[0]!,
    eye[1]! - EARTH.positionMpc[1]!,
    eye[2]! - EARTH.positionMpc[2]!,
  ] as Vec3);
  const f = normalize3([
    pose.target[0]! - eye[0]!,
    pose.target[1]! - eye[1]!,
    pose.target[2]! - eye[2]!,
  ] as Vec3);
  const vert = f[0]! * n[0]! + f[1]! * n[1]! + f[2]! * n[2]!;
  return Math.acos(Math.max(-1, Math.min(1, -vert)));
}

describe('approachTiltedPose (ruling 13)', () => {
  it('expresses exactly the ONE mapping at every altitude, eye fixed, roll carried', () => {
    for (const hr of [0.5, 1.0, 1.75, 2.0, 2.4, 2.8, 3.2, 3.39]) {
      const framed = centredPoseAt(hr);
      const out = approachTiltedPose(framed, true, FOCUS_EARTH, SIM, 0.5, B, B);
      if (out.frame !== 'absolute' || framed.frame !== 'absolute') {
        throw new Error('absolute expected');
      }
      // 7 digits: the yaw/pitch decode round-trip carries ~1e-8 of float
      // noise at heliocentric magnitudes; the mapping itself is exact.
      expect(tiltOf(out)).toBeCloseTo(mappedTiltRad(0.5, hr), 7);
      const eyeIn = eyeMpcOf(framed.pose, B);
      const eyeOut = eyeMpcOf(out.pose, B);
      const drift = Math.hypot(
        eyeOut[0]! - eyeIn[0]!,
        eyeOut[1]! - eyeIn[1]!,
        eyeOut[2]! - eyeIn[2]!,
      );
      expect(drift / (R_MPC * (1 + hr))).toBeLessThan(1e-9); // relative
      expect(out.pose.roll).toBe(0.2);
    }
  });

  it('never-engaged control: zero remembered returns the input BY REFERENCE', () => {
    const framed = centredPoseAt(2.0);
    expect(approachTiltedPose(framed, true, FOCUS_EARTH, SIM, 0, B, B)).toBe(framed);
  });

  it('inert above the band and for non-pivot drivers (clip/tween opt out)', () => {
    const above = centredPoseAt(5.0);
    expect(approachTiltedPose(above, true, FOCUS_EARTH, SIM, 0.5, B, B)).toBe(above);
    const inWindow = centredPoseAt(2.0);
    expect(approachTiltedPose(inWindow, false, FOCUS_EARTH, SIM, 0.5, B, B)).toBe(inWindow);
    expect(approachTiltedPose(inWindow, true, null, SIM, 0.5, B, B)).toBe(inWindow);
  });
});
