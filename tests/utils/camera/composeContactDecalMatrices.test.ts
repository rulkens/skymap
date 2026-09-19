/**
 * composeContactDecalMatrices — the box maps onto the decal and back. Every
 * expectation goes through `composeMeshMvp` on a body-frame point built by
 * hand, never through the box matrix under test.
 */

import { describe, expect, it } from 'vitest';
import { mat4d, vec4d } from 'wgpu-matrix';

import type { ContactDecal } from '../../../src/@types/data/mesh/ContactDecal';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { composeContactDecalMatrices } from '../../../src/utils/camera/composeContactDecalMatrices';
import { composeMeshMvp } from '../../../src/utils/camera/composeMeshMvp';

// Reversed-Z infinite-far, as the body rows draw; the eye sits at the slab origin.
const PROJ = mat4d.perspectiveReverseZ(Math.PI / 3, 1.5, 0.1) as Float64Array;
const ROT: Mat3 = [0, 0, -1, 0, 1, 0, 1, 0, 0];
// Oblique half-axes, so a swapped cross product flips the normal's sign.
const DECAL: ContactDecal = {
  centre: [0.4, -0.9, 0.2],
  halfU: [1.6, 0, 0.3],
  halfV: [0, 0.2, 1.2],
};

function vpLookingAt(target: Vec3): Float64Array {
  return mat4d.multiply(PROJ, mat4d.lookAt([0, 0, 0], target, [0, 1, 0])) as Float64Array;
}

function bodyPoint(a: number, b: number): Vec3 {
  const { centre: c, halfU: u, halfV: v } = DECAL;
  return [c[0] + a * u[0] + b * v[0], c[1] + a * u[1] + b * v[1], c[2] + a * u[2] + b * v[2]];
}

function toBox(clipToBox: Float64Array, mvp: Float64Array, p: Vec3): number[] {
  const clip = vec4d.transformMat4([p[0], p[1], p[2], 1], mvp);
  const q = vec4d.transformMat4(clip, clipToBox);
  return [q[0]! / q[3]!, q[1]! / q[3]!, q[2]! / q[3]!];
}

describe('composeContactDecalMatrices', () => {
  const posM: Vec3 = [5, -3, -20];
  const eye: Vec3 = [0, 0, 0];
  const vp = vpLookingAt(posM);

  it('clipToBox inverts boxToClip', () => {
    const { boxToClip, clipToBox } = composeContactDecalMatrices(vp, posM, eye, ROT, DECAL);
    const product = mat4d.multiply(clipToBox, boxToClip);
    const identity = mat4d.identity();
    for (let i = 0; i < 16; i++) expect(product[i]).toBeCloseTo(identity[i] as number, 9);
  });

  it('the box centre projects to the cube origin', () => {
    const { clipToBox } = composeContactDecalMatrices(vp, posM, eye, ROT, DECAL);
    const mvp = composeMeshMvp(vp, posM, eye, ROT);
    for (const x of toBox(clipToBox, mvp, DECAL.centre)) expect(x).toBeCloseTo(0, 9);
  });

  it("the box's up axis is the ground normal", () => {
    const { boxToClip } = composeContactDecalMatrices(vp, posM, eye, ROT, DECAL);
    const { centre: c, halfU: u, halfV: v } = DECAL;
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const s = 0.25 / Math.hypot(n[0]!, n[1]!, n[2]!);
    const top = [c[0] + n[0]! * s, c[1] + n[1]! * s, c[2] + n[2]! * s, 1];
    const expected = vec4d.transformMat4(top, composeMeshMvp(vp, posM, eye, ROT));
    const actual = vec4d.transformMat4([0, 0, 1, 1], boxToClip);
    for (let i = 0; i < 4; i++) expect(actual[i]).toBeCloseTo(expected[i] as number, 9);
  });

  it('keeps the round trip tight far from the origin', () => {
    // A Mars surface site: eye and rover both ~3.4e6 m from the body centre,
    // the rover 20 m from the eye.
    const farEye: Vec3 = [3.39e6, 1.2e5, -4.1e5];
    const offset: Vec3 = [12, -1.5, -15.9];
    const farPos: Vec3 = [farEye[0] + offset[0], farEye[1] + offset[1], farEye[2] + offset[2]];
    const farVp = vpLookingAt(offset);
    const { clipToBox } = composeContactDecalMatrices(farVp, farPos, farEye, ROT, DECAL);
    const mvp = composeMeshMvp(farVp, farPos, farEye, ROT);
    const actual = toBox(clipToBox, mvp, bodyPoint(0.3, -0.7));
    const expected = [0.3, -0.7, 0];
    for (let i = 0; i < 3; i++) expect(Math.abs(actual[i]! - expected[i]!)).toBeLessThan(1e-6);
  });
});
