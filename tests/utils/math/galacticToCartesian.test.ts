import { describe, it, expect } from 'vitest';
import { galacticToCartesian } from '../../../src/utils/math/galacticToCartesian';

describe('galacticToCartesian', () => {
  it('maps (l=0, b=0) to +X', () => {
    const [x, y, z] = galacticToCartesian(0, 0);
    expect(x).toBeCloseTo(1, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(0, 12);
  });

  it('maps (l=90, b=0) to +Y', () => {
    const [x, y, z] = galacticToCartesian(90, 0);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(1, 12);
    expect(z).toBeCloseTo(0, 12);
  });

  it('maps (b=90) to +Z (north galactic pole)', () => {
    const [x, y, z] = galacticToCartesian(123, 90);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(1, 12);
  });

  it('returns a unit vector', () => {
    const [x, y, z] = galacticToCartesian(137.37, 6.32);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
  });
});
