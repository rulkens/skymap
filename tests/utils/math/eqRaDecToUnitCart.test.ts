import { describe, it, expect } from 'vitest';
import { eqRaDecToUnitCart } from '../../../src/utils/math/eqRaDecToUnitCart';

describe('eqRaDecToUnitCart', () => {
  it('maps (RA=0, Dec=0) to +X', () => {
    const [x, y, z] = eqRaDecToUnitCart(0, 0);
    expect(x).toBeCloseTo(1, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(0, 12);
  });

  it('maps (RA=90, Dec=0) to +Y', () => {
    const [x, y, z] = eqRaDecToUnitCart(90, 0);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(1, 12);
    expect(z).toBeCloseTo(0, 12);
  });

  it('maps Dec=90 to +Z (north celestial pole)', () => {
    const [x, y, z] = eqRaDecToUnitCart(45, 90);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(1, 12);
  });

  it('returns a unit vector regardless of distance — it is direction-only', () => {
    const [x, y, z] = eqRaDecToUnitCart(266.4051, -28.9362);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
  });
});
