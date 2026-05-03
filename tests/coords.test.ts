import { describe, it, expect } from 'vitest';
import { redshiftToDistanceMpc, raDecZToCartesian } from '../src/data/coords';

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
