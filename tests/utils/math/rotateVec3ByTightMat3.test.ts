/**
 * rotateVec3ByTightMat3 — the load-bearing check is column-major correctness:
 * a transpose bug (reading the tight `Mat3` as row-major, or feeding it to
 * something expecting the vec4-padded layout) would swap which basis vector
 * each input axis picks up, so each standard basis vector must map to the
 * matching COLUMN of the matrix, not the matching row.
 */

import { describe, it, expect } from 'vitest';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import { mat3FromColumns } from '../../../src/utils/math/mat3FromColumns';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('rotateVec3ByTightMat3', () => {
  const c0: Vec3 = [1, 2, 3];
  const c1: Vec3 = [4, 5, 6];
  const c2: Vec3 = [7, 8, 9];
  const m = mat3FromColumns(c0, c1, c2);

  it('maps each standard basis vector to the matching COLUMN, not row', () => {
    expect(rotateVec3ByTightMat3([1, 0, 0], m)).toEqual(c0);
    expect(rotateVec3ByTightMat3([0, 1, 0], m)).toEqual(c1);
    expect(rotateVec3ByTightMat3([0, 0, 1], m)).toEqual(c2);
  });

  it('passes the vector through unchanged when frameBasis is undefined (identity frame)', () => {
    const v: Vec3 = [3, -4, 5];
    expect(rotateVec3ByTightMat3(v, undefined)).toEqual(v);
  });

  it('is safe to call in place (out === v)', () => {
    const v: Vec3 = [1, 0, 0];
    const ret = rotateVec3ByTightMat3(v, m, v);
    expect(ret).toBe(v);
    expect(v).toEqual(c0);
  });
});
