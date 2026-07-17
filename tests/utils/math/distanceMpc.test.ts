/**
 * distanceMpc — the Euclidean distance between two Mpc positions. One
 * hand-computed 3-4-5 case pins the contract (not a mirror of the impl's own
 * formula); the proximity demand/release edges depend on this being a real
 * distance, not a component difference.
 */
import { describe, it, expect } from 'vitest';
import { distanceMpc } from '../../../src/utils/math/distanceMpc';

describe('distanceMpc', () => {
  it('is the straight-line distance between two points', () => {
    // 3-4-5 in the xy-plane, offset from the origin so it is not just |b|.
    expect(distanceMpc([1, 2, 0], [4, 6, 0])).toBe(5);
  });
});
