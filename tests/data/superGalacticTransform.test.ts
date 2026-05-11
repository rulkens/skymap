/**
 * Anchored unit tests for the supergalactic → equatorial Cartesian
 * rotation. Validates against published positions of nearby clusters
 * (Virgo, Coma) plus geometric invariants (quaternion unit-norm,
 * matrix orthonormal). Tolerance is ~1° on RA/Dec — enough to confirm
 * the convention is right; precision below that is dominated by the
 * cluster-position uncertainties themselves.
 *
 * `SG_TO_EQ_MATRIX` is a flat **column-major** 9-tuple (`Mat3` from
 * `@types/Mat`).  Element at row r, column c is `m[c * 3 + r]`.
 */
import { describe, expect, it } from 'vitest';
import {
  SG_TO_EQ_MATRIX,
  SG_TO_EQ_MAT4_COL_MAJOR,
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

/** Read column c of a column-major flat 9-tuple. */
function col(m: typeof SG_TO_EQ_MATRIX, c: 0 | 1 | 2): readonly [number, number, number] {
  return [m[c * 3 + 0]!, m[c * 3 + 1]!, m[c * 3 + 2]!];
}

describe('superGalacticTransform', () => {
  it('exports a flat 9-element column-major Mat3 and a 4-element quaternion', () => {
    expect(SG_TO_EQ_MATRIX).toHaveLength(9);
    expect(SG_TO_EQ_QUATERNION).toHaveLength(4);
  });

  it('quaternion is unit-norm', () => {
    const [x, y, z, w] = SG_TO_EQ_QUATERNION;
    const norm = Math.hypot(x, y, z, w);
    expect(norm).toBeCloseTo(1, 6);
  });

  it('matrix is orthonormal (columns have unit length, dot products are zero)', () => {
    const c0 = col(SG_TO_EQ_MATRIX, 0);
    const c1 = col(SG_TO_EQ_MATRIX, 1);
    const c2 = col(SG_TO_EQ_MATRIX, 2);
    expect(Math.hypot(...c0)).toBeCloseTo(1, 6);
    expect(Math.hypot(...c1)).toBeCloseTo(1, 6);
    expect(Math.hypot(...c2)).toBeCloseTo(1, 6);
    const dot = (a: readonly [number, number, number], b: readonly [number, number, number]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(c0, c1)).toBeCloseTo(0, 6);
    expect(dot(c0, c2)).toBeCloseTo(0, 6);
    expect(dot(c1, c2)).toBeCloseTo(0, 6);
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

  describe('SG_TO_EQ_MAT4_COL_MAJOR', () => {
    it('is a 16-element column-major layout', () => {
      expect(SG_TO_EQ_MAT4_COL_MAJOR).toHaveLength(16);
    });

    it('upper-left 3x3 (column-major) equals SG_TO_EQ_MATRIX', () => {
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 3; r++) {
          expect(SG_TO_EQ_MAT4_COL_MAJOR[c * 4 + r]).toBeCloseTo(
            SG_TO_EQ_MATRIX[c * 3 + r]!,
            10,
          );
        }
      }
    });

    it('translation column is zero, w corner is 1', () => {
      expect(SG_TO_EQ_MAT4_COL_MAJOR[12]).toBe(0);
      expect(SG_TO_EQ_MAT4_COL_MAJOR[13]).toBe(0);
      expect(SG_TO_EQ_MAT4_COL_MAJOR[14]).toBe(0);
      expect(SG_TO_EQ_MAT4_COL_MAJOR[15]).toBe(1);
    });

    it('homogeneous w-row of upper 3 columns is zero', () => {
      expect(SG_TO_EQ_MAT4_COL_MAJOR[3]).toBe(0);
      expect(SG_TO_EQ_MAT4_COL_MAJOR[7]).toBe(0);
      expect(SG_TO_EQ_MAT4_COL_MAJOR[11]).toBe(0);
    });

    it('applied as a column-major mat4, rotates Coma SG to expected EQ', () => {
      const sg: readonly [number, number, number] = [0, 93.8, 7.8];
      const eq: [number, number, number] = [0, 0, 0];
      for (let r = 0; r < 3; r++) {
        eq[r] =
          SG_TO_EQ_MAT4_COL_MAJOR[0 * 4 + r]! * sg[0] +
          SG_TO_EQ_MAT4_COL_MAJOR[1 * 4 + r]! * sg[1] +
          SG_TO_EQ_MAT4_COL_MAJOR[2 * 4 + r]! * sg[2];
      }
      const eq3x3 = sgCartesianToEquatorial(sg);
      for (let r = 0; r < 3; r++) {
        expect(eq[r]).toBeCloseTo(eq3x3[r]!, 6);
      }
    });
  });
});
