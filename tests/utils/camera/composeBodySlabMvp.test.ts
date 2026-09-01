/**
 * composeBodySlabMvp — translate/scale compose tests.
 *
 * The offset case isolates translate (scale of the origin is a no-op); the
 * scale case isolates scale (identity translate) and doubles as the Mpc-leak
 * guard — a radius passed in Mpc would land unitX orders of magnitude short
 * of 6.371e6. Both compute their expectation independently, via `slabVp`
 * or `vec4.transformMat4` directly, never through `composeBodySlabMvp`.
 */

import { describe, expect, it } from 'vitest';
import { mat4d, vec4 } from 'wgpu-matrix';

import type { Vec3 } from '../../../src/@types/math/Vec3';
import { composeBodySlabMvp } from '../../../src/utils/camera/composeBodySlabMvp';

describe('composeBodySlabMvp', () => {
  it('puts the body centre at the eye-relative offset', () => {
    // Non-symmetric slabVp (a real perspective·lookAt, not identity) so a
    // transposed embed or a swapped multiply order would land at a different NDC.
    const slabVp = mat4d.multiply(
      mat4d.perspective(Math.PI / 4, 1, 0.1, 100),
      mat4d.lookAt([2, 1, 10], [0, 0, 0], [0, 1, 0]),
    ) as Float64Array;
    const eyeRelBodyM: Vec3 = [3, -2, 5];

    const mvp = composeBodySlabMvp(slabVp, eyeRelBodyM, 50);
    const actual = vec4.transformMat4([0, 0, 0, 1], mvp);

    // Independent expectation: the body centre in model space is the origin,
    // which scale leaves untouched, so translate(−eyeRelBodyM) alone decides
    // where it lands — project −eyeRelBodyM through slabVp directly.
    const expected = vec4.transformMat4(
      [-eyeRelBodyM[0], -eyeRelBodyM[1], -eyeRelBodyM[2], 1],
      slabVp,
    );

    expect(actual[0]).toBeCloseTo(expected[0] as number, 9);
    expect(actual[1]).toBeCloseTo(expected[1] as number, 9);
    expect(actual[2]).toBeCloseTo(expected[2] as number, 9);
    expect(actual[3]).toBeCloseTo(expected[3] as number, 9);
  });

  it('scales the unit sphere to metres', () => {
    // Identity slabVp and zero offset isolate the scale factor: a unit-X
    // point must land at exactly (radiusM, 0, 0).
    const identityVp = mat4d.identity() as Float64Array;
    const radiusM = 6_371_000;

    const mvp = composeBodySlabMvp(identityVp, [0, 0, 0], radiusM);
    const unitX = vec4.transformMat4([1, 0, 0, 1], mvp);

    expect(unitX[0]).toBeCloseTo(radiusM, 3);
    expect(unitX[1]).toBeCloseTo(0, 9);
    expect(unitX[2]).toBeCloseTo(0, 9);
  });
});
