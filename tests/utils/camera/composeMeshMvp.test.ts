/**
 * composeMeshMvp — translate/rotate compose tests.
 *
 * The placement case pins the translation the mesh pass needs and no other
 * (`posM − eyeRelBodyM`, not `composeBodySlabMvp`'s `−eyeRelBodyM`); the
 * rotation case is the `Mat3` embed guard — a transposed or 12-float-padded
 * read lands a vertex somewhere else with no compiler complaint. Both build
 * their expectation from `slabVp` directly, never through `composeMeshMvp`.
 */

import { describe, expect, it } from 'vitest';
import { mat4d, vec4 } from 'wgpu-matrix';

import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { composeMeshMvp } from '../../../src/utils/camera/composeMeshMvp';

// A real perspective·lookAt, not identity, so a swapped multiply order shows.
const SLAB_VP = mat4d.multiply(
  mat4d.perspective(Math.PI / 4, 1, 0.1, 1000),
  mat4d.lookAt([2, 1, 40], [0, 0, 0], [0, 1, 0]),
) as Float64Array;

const IDENTITY_ROT: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('composeMeshMvp', () => {
  it('places the body centre at posM − eyeRelBodyM', () => {
    const posM: Vec3 = [10, -4, 7];
    const eyeRelBodyM: Vec3 = [3, -2, 5];

    const actual = vec4.transformMat4(
      [0, 0, 0, 1],
      composeMeshMvp(SLAB_VP, posM, eyeRelBodyM, IDENTITY_ROT),
    );
    const expected = vec4.transformMat4([7, -2, 2, 1], SLAB_VP);

    for (let i = 0; i < 4; i++) expect(actual[i]).toBeCloseTo(expected[i] as number, 9);
  });

  it('rotates a vertex by the column-major Mat3, not its transpose', () => {
    // Quarter turn about +Y, column-major: +X maps to −Z, +Z maps to +X. The
    // transpose sends +X to +Z instead, a mirrored body with no type error.
    const yawQuarter: Mat3 = [0, 0, -1, 0, 1, 0, 1, 0, 0];
    const origin: Vec3 = [0, 0, 0];

    const actual = vec4.transformMat4(
      [5, 0, 0, 1],
      composeMeshMvp(SLAB_VP, origin, origin, yawQuarter),
    );
    const expected = vec4.transformMat4([0, 0, -5, 1], SLAB_VP);

    for (let i = 0; i < 4; i++) expect(actual[i]).toBeCloseTo(expected[i] as number, 9);
  });
});
