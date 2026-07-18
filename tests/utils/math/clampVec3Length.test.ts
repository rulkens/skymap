import { describe, it, expect } from 'vitest';
import { clampVec3Length } from '../../../src/utils/math/clampVec3Length';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('clampVec3Length', () => {
  it('returns the input reference unchanged when already within the limit', () => {
    const v: Vec3 = [3, 4, 0]; // length 5
    expect(clampVec3Length(v, 10)).toBe(v);
  });

  it('scales an over-limit vector to the max length, preserving direction', () => {
    const v: Vec3 = [3, 4, 0]; // length 5, scale 2.5/5 = 0.5
    const out = clampVec3Length(v, 2.5);
    expect(out).toEqual([1.5, 2, 0]);
    expect(Math.hypot(out[0], out[1], out[2])).toBeCloseTo(2.5, 12);
    // Collinear with the original (same unit direction).
    expect(out[0] / v[0]).toBeCloseTo(out[1] / v[1], 12);
  });
});
