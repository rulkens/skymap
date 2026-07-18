/**
 * cameraBillboardBasis — unit tests for the world-space billboard axes.
 *
 * Mirrors the roll litmus test in orbitCamera.test.ts (`roll=π/2 rotates
 * image right-basis to world +Y`): both tests exist because
 * `computeViewProj` and `cameraBillboardBasis` derive the same rolled-up
 * vector independently (see the didactic header on the source file for
 * why the math isn't shared), so a regression in either one's Rodrigues
 * step should show up as a mismatch here.
 */

import { describe, it, expect } from 'vitest';

import type { Vec3 } from '../../../src/@types/math/Vec3';
import { cameraBillboardBasis } from '../../../src/utils/camera/cameraBillboardBasis';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';

describe('cameraBillboardBasis', () => {
  it('identity pose gives world-aligned axes', () => {
    // yaw=0, pitch=0, roll=0 puts the camera on +Z looking at the origin —
    // the same convention as orbitCamera.test.ts's first case.
    const cam = createOrbitCamera({
      target: [0, 0, 0],
      distance: 10,
      yaw: 0,
      pitch: 0,
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: 0.1,
      far: 100,
    });

    const { right, up } = cameraBillboardBasis(cam);

    expect(right[0]).toBeCloseTo(1, 5);
    expect(right[1]).toBeCloseTo(0, 5);
    expect(right[2]).toBeCloseTo(0, 5);

    expect(up[0]).toBeCloseTo(0, 5);
    expect(up[1]).toBeCloseTo(1, 5);
    expect(up[2]).toBeCloseTo(0, 5);
  });

  it('axes are unit length and mutually orthogonal (also to forward)', () => {
    // An oblique yaw/pitch so no component happens to be zero by symmetry.
    const cam = createOrbitCamera({
      target: [1, -2, 3],
      distance: 7,
      yaw: 0.6,
      pitch: 0.35,
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: 0.1,
      far: 100,
      roll: 0.9,
    });

    const { right, up } = cameraBillboardBasis(cam);

    // Vec3 (a fixed 3-tuple), not readonly number[]: the house rule for
    // 3-vectors, and under noUncheckedIndexedAccess tuple indices 0/1/2
    // are defined while plain-array indexing yields `number | undefined`.
    const dot = (a: Readonly<Vec3>, b: Readonly<Vec3>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const length = (v: Readonly<Vec3>) => Math.sqrt(dot(v, v));

    let fx = cam.target[0] - cam.position[0];
    let fy = cam.target[1] - cam.position[1];
    let fz = cam.target[2] - cam.position[2];
    const flen = Math.hypot(fx, fy, fz) || 1;
    fx /= flen;
    fy /= flen;
    fz /= flen;
    const forward: Vec3 = [fx, fy, fz];

    expect(length(right)).toBeCloseTo(1, 5);
    expect(length(up)).toBeCloseTo(1, 5);
    expect(dot(right, up)).toBeCloseTo(0, 5);
    expect(dot(right, forward)).toBeCloseTo(0, 5);
    expect(dot(up, forward)).toBeCloseTo(0, 5);
  });

  it('roll rotates the basis about the view direction', () => {
    // Same setup + reasoning as orbitCamera.test.ts's roll=π/2 case: at
    // yaw=0, pitch=0 the unrolled right/up are world +X / +Y (camera sits
    // on +Z, forward points toward the origin along world −Z). A 90° CCW
    // roll about that view direction should swap them up to sign: new
    // right ≈ world +Y, new up ≈ world −X.
    const cam = createOrbitCamera({
      target: [0, 0, 0],
      distance: 10,
      yaw: 0,
      pitch: 0,
      fovYRad: Math.PI / 4,
      aspect: 1,
      near: 0.1,
      far: 100,
      roll: Math.PI / 2,
    });

    const { right, up } = cameraBillboardBasis(cam);

    expect(right[0]).toBeCloseTo(0, 5);
    expect(right[1]).toBeCloseTo(1, 5);
    expect(right[2]).toBeCloseTo(0, 5);

    expect(up[0]).toBeCloseTo(-1, 5);
    expect(up[1]).toBeCloseTo(0, 5);
    expect(up[2]).toBeCloseTo(0, 5);
  });
});
