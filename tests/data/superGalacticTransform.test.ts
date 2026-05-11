/**
 * Anchored unit tests for the supergalactic → equatorial Cartesian
 * rotation. Validates against published positions of nearby clusters
 * (Virgo, Coma) plus geometric invariants (quaternion unit-norm,
 * matrix orthonormal). Tolerance is ~1° on RA/Dec — enough to confirm
 * the convention is right; precision below that is dominated by the
 * cluster-position uncertainties themselves.
 */
import { describe, expect, it } from 'vitest';
import {
  SG_TO_EQ_MATRIX,
  SG_TO_EQ_QUATERNION,
  sgCartesianToEquatorial,
} from '../../src/data/superGalacticTransform';

const RAD = Math.PI / 180;

/** Convert an equatorial Cartesian (Mpc) to (RA degrees, Dec degrees, distance Mpc). */
function eqCartesianToRaDecDist(eq: readonly [number, number, number]): {
  ra: number;
  dec: number;
  dist: number;
} {
  const [x, y, z] = eq;
  const dist = Math.hypot(x, y, z);
  const ra = ((Math.atan2(y, x) / RAD) + 360) % 360;
  const dec = Math.asin(z / dist) / RAD;
  return { ra, dec, dist };
}

describe('superGalacticTransform', () => {
  it('exports a 3x3 matrix and a 4-element quaternion', () => {
    expect(SG_TO_EQ_MATRIX).toHaveLength(3);
    SG_TO_EQ_MATRIX.forEach((row) => expect(row).toHaveLength(3));
    expect(SG_TO_EQ_QUATERNION).toHaveLength(4);
  });

  it('quaternion is unit-norm', () => {
    const [x, y, z, w] = SG_TO_EQ_QUATERNION;
    const norm = Math.hypot(x, y, z, w);
    expect(norm).toBeCloseTo(1, 6);
  });

  it('matrix is orthonormal (rows have unit length, dot products are zero)', () => {
    const [r0, r1, r2] = SG_TO_EQ_MATRIX;
    expect(Math.hypot(...r0)).toBeCloseTo(1, 6);
    expect(Math.hypot(...r1)).toBeCloseTo(1, 6);
    expect(Math.hypot(...r2)).toBeCloseTo(1, 6);
    const dot = (a: readonly [number, number, number], b: readonly [number, number, number]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(r0, r1)).toBeCloseTo(0, 6);
    expect(dot(r0, r2)).toBeCloseTo(0, 6);
    expect(dot(r1, r2)).toBeCloseTo(0, 6);
  });

  it('maps origin to origin', () => {
    expect(sgCartesianToEquatorial([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('maps Virgo (SGX≈-2.5, SGY≈+10.0, SGZ≈-1.0 Mpc/h) to RA≈187°, Dec≈+12°, dist≈10 Mpc/h', () => {
    const eq = sgCartesianToEquatorial([-2.5, 10.0, -1.0]);
    const { ra, dec, dist } = eqCartesianToRaDecDist(eq);
    expect(ra).toBeGreaterThan(184);
    expect(ra).toBeLessThan(190);
    expect(dec).toBeGreaterThan(9);
    expect(dec).toBeLessThan(15);
    // Distance is preserved by an orthonormal rotation; Mpc/h, not physical Mpc.
    expect(dist).toBeCloseTo(Math.hypot(-2.5, 10.0, -1.0), 5);
  });

  it('maps Coma (SGX≈+0.6, SGY≈+71.5, SGZ≈+12 Mpc/h) to RA≈195°, Dec≈+27°', () => {
    const eq = sgCartesianToEquatorial([0.6, 71.5, 12]);
    const { ra, dec } = eqCartesianToRaDecDist(eq);
    expect(ra).toBeGreaterThan(192);
    expect(ra).toBeLessThan(198);
    expect(dec).toBeGreaterThan(24);
    expect(dec).toBeLessThan(30);
  });
});
