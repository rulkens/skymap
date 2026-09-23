/**
 * linkedPoseToWorld — a shared link must put the eye where the link says, in
 * the host's own body-fixed frame: a missed host rotation, a heading measured
 * from the wrong pole, or a metre/Mpc slip each leaves a plausible pose
 * somewhere else.
 */

import { describe, it, expect } from 'vitest';
import { linkedPoseToWorld } from '../../../src/utils/camera/linkedPoseToWorld';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { yawPitchToDir } from '../../../src/utils/camera/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const BASIS = ORIENTATION_FRAMES.ecliptic;
const SIM_DAYS = CONST_J2000 + 9763.2;

/** A world point relative to `body`, in its body-fixed metres (the transpose of its orientation). */
function toLocalM(pointMpc: Readonly<Vec3>, body: BodyState): Vec3 {
  const d = [0, 1, 2].map((i) => (pointMpc[i]! - body.positionMpc[i]!) * SCALE_UNITS.MPC_TO_M);
  const o = body.orientation;
  return [0, 1, 2].map(
    (c) => o[c * 3]! * d[0]! + o[c * 3 + 1]! * d[1]! + o[c * 3 + 2]! * d[2]!,
  ) as Vec3;
}

function eyeMpc(pose: CameraPose): Vec3 {
  const toEye = rotateVec3ByTightMat3(yawPitchToDir(pose.yaw, pose.pitch), BASIS);
  return [0, 1, 2].map((i) => pose.target[i]! + pose.distance * toEye[i]!) as Vec3;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

describe('linkedPoseToWorld', () => {
  const bodies = deriveBodyStates(SIM_DAYS);

  it('puts a site pose’s eye at its heading, elevation and range from the rover', () => {
    const [heading, elevation, rangeM] = [0.48274334808813857, 0.15066116048769496, 8.61754];
    const pose = linkedPoseToWorld(
      `s,perseverance,${heading},${elevation},${rangeM}`,
      SIM_DAYS,
      BASIS,
    );
    const mars = bodies.get('mars')!;
    const rover = toLocalM(bodies.get('perseverance')!.positionMpc, mars);
    const eye = toLocalM(eyeMpc(pose), mars);
    const up = normalize3(rover);
    const east = normalize3(cross([0, 0, 1], up));
    const north = cross(up, east);
    const [ce, se, ch, sh] = [
      Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(heading),
      Math.sin(heading),
    ];
    for (let i = 0; i < 3; i++) {
      const expected = rover[i]! + rangeM * (ce * (ch * north[i]! + sh * east[i]!) + se * up[i]!);
      expect(eye[i]!).toBeCloseTo(expected, 1);
    }
  });

  it('puts a body pose’s eye at its body-fixed metres', () => {
    const eyeM: Vec3 = [3507565.09, 779181.37, 5261187.66];
    const basis = '1,0,0,0,1,0,0,0,1';
    const pose = linkedPoseToWorld(`b,earth,0,0,0,${eyeM.join(',')},${basis}`, SIM_DAYS, BASIS);
    const eye = toLocalM(eyeMpc(pose), bodies.get('earth')!);
    for (let i = 0; i < 3; i++) expect(eye[i]!).toBeCloseTo(eyeM[i]!, -1);
  });

  it('throws on an undecodable value', () => {
    expect(() => linkedPoseToWorld('s,nowhere,0,0,1', SIM_DAYS, BASIS)).toThrow(/undecodable/);
  });
});
