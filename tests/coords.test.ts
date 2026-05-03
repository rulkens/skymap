import { describe, it, expect } from 'vitest';
import { redshiftToDistanceMpc, raDecZToCartesian, cartesianToRaDecZ } from '../src/utils/math/coords';

const close = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

describe('redshiftToDistanceMpc', () => {
  it('returns 0 at z=0', () => {
    expect(redshiftToDistanceMpc(0)).toBe(0);
  });
  it('returns ~4282.75 Mpc at z=1', () => {
    expect(close(redshiftToDistanceMpc(1), 4282.749, 0.01)).toBe(true);
  });
});

describe('raDecZToCartesian', () => {
  it('places (RA=0, Dec=0, z=1) on +x axis', () => {
    const [x, y, z] = raDecZToCartesian(0, 0, 1);
    expect(close(x, 4282.749, 0.01)).toBe(true);
    expect(close(y, 0)).toBe(true);
    expect(close(z, 0)).toBe(true);
  });
  it('places (RA=90, Dec=0, z=1) on +y axis', () => {
    const [x, y, z] = raDecZToCartesian(90, 0, 1);
    expect(close(x, 0, 1e-6)).toBe(true);
    expect(close(y, 4282.749, 0.01)).toBe(true);
    expect(close(z, 0, 1e-6)).toBe(true);
  });
  it('places (RA=*, Dec=90, z=1) on +z axis', () => {
    const [x, y, z] = raDecZToCartesian(123, 90, 1);
    expect(close(x, 0, 1e-6)).toBe(true);
    expect(close(y, 0, 1e-6)).toBe(true);
    expect(close(z, 4282.749, 0.01)).toBe(true);
  });
  it('returns origin at z=0', () => {
    const [x, y, z] = raDecZToCartesian(45, 30, 0);
    expect([x, y, z]).toEqual([0, 0, 0]);
  });
});

describe('cartesianToRaDecZ', () => {
  it('returns origin sentinels at (0, 0, 0)', () => {
    expect(cartesianToRaDecZ(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it('inverts the forward conversion (round-trip)', () => {
    const cases: Array<[number, number, number]> = [
      [10, 20, 0.05],
      [180, 30, 0.1],
      [350, -45, 0.2],
      [0, 0, 0.5],
      [90, 0, 0.3],
      [123.456, 78.9, 0.07],
    ];
    for (const [raIn, decIn, zIn] of cases) {
      const [x, y, zc] = raDecZToCartesian(raIn, decIn, zIn);
      const [raOut, decOut, zOut] = cartesianToRaDecZ(x, y, zc);
      expect(close(raOut, raIn, 1e-3)).toBe(true);
      expect(close(decOut, decIn, 1e-3)).toBe(true);
      expect(close(zOut, zIn, 1e-6)).toBe(true);
    }
  });

  it('normalises RA into [0, 360)', () => {
    // (RA = 350, Dec = 0, z = 0.1) lies in the -y half-space, atan2 gives -10°.
    // Function must wrap to 350°, not return -10.
    const [x, y, z] = raDecZToCartesian(350, 0, 0.1);
    const [ra, , ] = cartesianToRaDecZ(x, y, z);
    expect(ra).toBeGreaterThanOrEqual(0);
    expect(ra).toBeLessThan(360);
    expect(close(ra, 350, 1e-3)).toBe(true);
  });
});
