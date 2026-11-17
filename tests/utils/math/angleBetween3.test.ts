import { describe, expect, it } from 'vitest';
import { angleBetween3 } from '../../../src/utils/math/angleBetween3';

describe('angleBetween3', () => {
  it('resolves a microradian between unnormalised vectors, where acos(dot) rounds to 0', () => {
    expect(angleBetween3([20, 2e-5, 0], [5, 0, 0])).toBeCloseTo(1e-6, 12);
    expect(angleBetween3([0, 3, 0], [-2, 0, 0])).toBeCloseTo(Math.PI / 2, 12);
  });
});
