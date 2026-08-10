/**
 * distance3 — the Euclidean distance between two Vec3s. Same hand-computed
 * 3-4-5 case as `distanceMpc.test.ts` (not a mirror of the impl's own
 * formula), since the two share a body but not a unit.
 */
import { describe, it, expect } from 'vitest';
import { distance3 } from '../../../src/utils/math/distance3';

describe('distance3', () => {
  it('is the straight-line distance between two points', () => {
    // 3-4-5 in the xy-plane, offset from the origin so it is not just |b|.
    expect(distance3([1, 2, 0], [4, 6, 0])).toBe(5);
  });
});
