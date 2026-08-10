import { describe, it, expect } from 'vitest';
import { normalize3 } from '../../../src/utils/math/normalize3';

describe('normalize3', () => {
  it('scales a vector to unit length, preserving direction', () => {
    const out = normalize3([3, 4, 0]);
    expect(out[0]).toBeCloseTo(0.6, 12);
    expect(out[1]).toBeCloseTo(0.8, 12);
    expect(out[2]).toBe(0);
    expect(Math.hypot(out[0], out[1], out[2])).toBeCloseTo(1, 12);
  });

  it('falls back to the zero vector unchanged instead of dividing by zero', () => {
    expect(normalize3([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
