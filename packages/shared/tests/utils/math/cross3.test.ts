import { describe, it, expect } from 'vitest';
import { cross3 } from '../../../src/utils/math/cross3';

describe('cross3', () => {
  it('is right-handed: x cross y = z', () => {
    expect(cross3([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
  });

  it('is anti-commutative', () => {
    const a: [number, number, number] = [1, 2, 3];
    const b: [number, number, number] = [4, 5, 6];
    expect(cross3(a, b)).toEqual(cross3(b, a).map((n) => -n));
  });
});
