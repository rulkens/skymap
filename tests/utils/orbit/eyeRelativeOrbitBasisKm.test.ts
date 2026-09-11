/**
 * eyeRelativeOrbitBasisKm — the packed basis must rebuild a known orbit point
 * eye-relative in kilometres: eye and centre far from the origin so a wrong
 * subtraction order or a missed unit change cannot pass.
 */

import { describe, expect, it } from 'vitest';

import { eyeRelativeOrbitBasisKm } from '../../../src/utils/orbit/eyeRelativeOrbitBasisKm';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const KM = SCALE_UNITS.KM_TO_MPC;

describe('eyeRelativeOrbitBasisKm', () => {
  it('rebuilds C + A − eye in kilometres at the requested offset', () => {
    const eye: Vec3 = [10 * KM, -4 * KM, 7 * KM];
    const C: Vec3 = [12 * KM, -3 * KM, 7.5 * KM];
    const A: Vec3 = [3 * KM, 0, 0];
    const B: Vec3 = [0, 2 * KM, 0];
    const out = new Float32Array(20).fill(NaN);
    eyeRelativeOrbitBasisKm(
      { eyeMpc: eye, centerMpc: C, semiMajorMpc: A, semiMinorMpc: B },
      out,
      4,
    );

    const x = [0, 1, 2].map((i) => out[4 + i]! + 1 * out[8 + i]! + 0.5 * out[12 + i]!);
    expect(x[0]).toBeCloseTo(5, 4); // (12 + 3 − 10) km
    expect(x[1]).toBeCloseTo(2, 4); // (−3 + 1 + 4) km
    expect(x[2]).toBeCloseTo(0.5, 4);
    // Nothing outside [at, at + 12) is touched.
    expect(out[3]).toBeNaN();
    expect(out[16]).toBeNaN();
  });
});
