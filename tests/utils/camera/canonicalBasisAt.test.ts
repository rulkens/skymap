import { describe, it, expect } from 'vitest';

import { canonicalBasisAt } from '../../../src/utils/camera/canonicalBasisAt';
import { eyeFrameOf } from '../../../src/utils/camera/eyeFrameOf';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { EyeFrame } from '../../../src/@types/camera/EyeFrame';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// An equatorial standpoint (localUp = +X), so east/north are the ordinary
// geographic ones rather than the pole's degenerate fallback.
const FRAME: EyeFrame = {
  localUp: [1, 0, 0],
  east: [0, 1, 0],
  north: [0, 0, 1],
  tiltRad: 0,
  azimuthRad: 0,
};

function dot(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function handednessSign(basis: Readonly<Mat3>): number {
  const right: Vec3 = [basis[0], basis[1], basis[2]];
  const up: Vec3 = [basis[3], basis[4], basis[5]];
  const forward: Vec3 = [basis[6], basis[7], basis[8]];
  for (const v of [right, up, forward]) expect(Math.hypot(...v)).toBeCloseTo(1, 12);
  expect(dot(right, up)).toBeCloseTo(0, 12);
  expect(dot(up, forward)).toBeCloseTo(0, 12);
  expect(dot(forward, right)).toBeCloseTo(0, 12);
  return Math.sign(dot(forward, cross(right, up)));
}

describe('canonicalBasisAt', () => {
  it('is orthonormal with the view convention’s handedness across azimuth and tilt', () => {
    // `right = forward × up`, so `forward · (right × up)` is −1: forward is
    // the look direction, into the screen. A sign slip in any one of the four
    // trig terms flips the triad, and does so only over part of the range —
    // hence samples spread over the azimuth/tilt sign combinations rather
    // than one fixed angle.
    const samples: ReadonlyArray<readonly [number, number]> = [
      [0.9, 1.0],
      [-2.4, 0.3],
      [3.0, 2.6],
      [0.1, Math.PI - 0.1],
    ];
    for (const [az, tilt] of samples) {
      expect(handednessSign(canonicalBasisAt(FRAME, az, tilt))).toBe(-1);
    }
  });

  it('round-trips tilt and azimuth through eyeFrameOf', () => {
    const azimuthRad = 2.1;
    const tiltRad = 1.0; // away from the 45° source-switch in refAzimuthOf
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [5, 0, 0], // eye along localUp, radius 5
      basisLocal: canonicalBasisAt(FRAME, azimuthRad, tiltRad),
    };
    const readBack = eyeFrameOf(pose, 1, [0, 0, 1]);
    expect(readBack).not.toBeNull();
    expect(readBack?.tiltRad).toBeCloseTo(tiltRad, 10);
    expect(readBack?.azimuthRad).toBeCloseTo(azimuthRad, 10);
  });
});
