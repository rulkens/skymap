/**
 * composeBodySlabMvp — translate/scale compose tests.
 *
 * The offset case isolates translate (scale of the origin is a no-op); the
 * scale case isolates scale (identity translate). Both compute their
 * expectation independently — via `slabVp`/`vec4.transformMat4` directly,
 * never through `composeBodySlabMvp` itself — so a sign flip or a swapped
 * multiply order shows up as a mismatch, not a tautology.
 *
 * The denormal case is spec §10's structural criterion made concrete, with
 * the contrast number verified against `SCALE_UNITS.M_TO_MPC` rather than
 * copied from the spec prose: Earth's radiusM² in Mpc² (≈4.26e-32) is
 * catastrophically smaller than in m² (≈4.06e13), though it is the much
 * smaller near-surface DELTA (~3.3 km, the shipped black-nadir bug) that
 * actually crosses f32's denormal boundary — the full-body radius does not.
 */

import { describe, expect, it } from 'vitest';
import { mat4d, vec4 } from 'wgpu-matrix';

import type { Vec3 } from '../../../src/@types/math/Vec3';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
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

  it("squares Earth's radius outside f32's denormal range", () => {
    const radiusM = 6_371_000;
    const radiusMSquared = radiusM * radiusM;
    expect(radiusMSquared).toBeGreaterThanOrEqual(1e12); // ≈4.06e13

    const radiusMpc = radiusM * SCALE_UNITS.M_TO_MPC;
    const radiusMpcSquared = radiusMpc * radiusMpc;
    // Not itself inside f32's denormal band (1.18e-38) — see module header —
    // but ~41 orders of magnitude below the metres value, the signature a
    // radius leaking into a Mpc slot would leave in this arithmetic.
    expect(radiusMpcSquared).toBeLessThan(1e-30); // ≈4.26e-32
    expect(radiusMSquared / radiusMpcSquared).toBeGreaterThan(1e40);
  });
});
