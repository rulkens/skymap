import { describe, it, expect } from 'vitest';

import { tiltTurnedPose } from '../../../src/utils/camera/tiltTurnedPose';
import { tiltFromNadirRad } from '../../../src/utils/camera/tiltFromNadirRad';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Right | up | forward at heading 0, tilt θ from nadir, eye on +Z. */
function basisAtTilt(theta: number): Mat3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [1, 0, 0, 0, c, s, 0, s, -c];
}

function poseAt(eyeM: Vec3, basisLocal: Mat3): BodyFixedPose {
  return { bodyId: 'earth', anchorLocalM: [0, 0, 0], eyeRelAnchorM: eyeM, basisLocal };
}

function forwardOf(p: BodyFixedPose): Vec3 {
  return [p.basisLocal[6], p.basisLocal[7], p.basisLocal[8]];
}

describe('tiltTurnedPose', () => {
  it('a positive turn about the eye raises the tilt by exactly that angle, heading untouched', () => {
    const out = tiltTurnedPose(poseAt([0, 0, 2], basisAtTilt(0.5)), 0.3, null);
    expect(tiltFromNadirRad(forwardOf(out), out.eyeRelAnchorM)).toBeCloseTo(0.8, 12);
    expect(forwardOf(out)[0]).toBeCloseTo(0, 12);
    expect(out.eyeRelAnchorM).toEqual([0, 0, 2]);
  });

  it('about a surface anchor the whole pose turns rigidly: the eye orbits the anchor', () => {
    const anchor: Vec3 = [0, 0, 1];
    const before = poseAt([0, 0, 2], basisAtTilt(0.5));
    const out = tiltTurnedPose(before, -0.2, anchor);
    const e = out.eyeRelAnchorM;
    // Eye − anchor was (0, 0, 1); a 0.2 rad turn about the east keeps its
    // length and swings it 0.2 rad off the radial.
    expect(Math.hypot(e[0], e[1], e[2] - 1)).toBeCloseTo(1, 12);
    expect(Math.abs(e[1])).toBeCloseTo(Math.sin(0.2), 12);
    expect(e[2]).toBeCloseTo(1 + Math.cos(0.2), 12);
    const f0 = forwardOf(before);
    const f1 = forwardOf(out);
    expect(Math.acos(f0[0] * f1[0] + f0[1] * f1[1] + f0[2] * f1[2])).toBeCloseTo(0.2, 12);
  });

  it('at exact nadir a raising turn tips about screen-right; anything else is identity by reference', () => {
    const nadir = poseAt([0, 0, 2], [1, 0, 0, 0, 1, 0, 0, 0, -1]);
    const raised = tiltTurnedPose(nadir, 0.3, null);
    expect(tiltFromNadirRad(forwardOf(raised), raised.eyeRelAnchorM)).toBeCloseTo(0.3, 12);
    expect(raised.basisLocal[6]).toBeCloseTo(0, 12);
    expect(tiltTurnedPose(nadir, -0.3, null)).toBe(nadir);
    expect(tiltTurnedPose(nadir, 0, null)).toBe(nadir);
  });
});
