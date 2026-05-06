import { describe, it, expect } from 'vitest';
import { fallbackOrientation } from '../../../src/utils/random/fallbackOrientation';

describe('fallbackOrientation', () => {
  it('is deterministic for the same input', () => {
    const a = fallbackOrientation(123n, 12.5, -3.2);
    const b = fallbackOrientation(123n, 12.5, -3.2);
    expect(a).toEqual(b);
  });

  it('produces different values for different inputs', () => {
    const a = fallbackOrientation(1n, 0, 0);
    const b = fallbackOrientation(2n, 0, 0);
    expect(a).not.toEqual(b);
  });

  it('axisRatio in [0.3, 1.0)', () => {
    for (let i = 0n; i < 1000n; i++) {
      const { axisRatio } = fallbackOrientation(i, 0.1 * Number(i), 0);
      expect(axisRatio).toBeGreaterThanOrEqual(0.3);
      expect(axisRatio).toBeLessThan(1.0);
    }
  });

  it('positionAngleDeg in [0, 180)', () => {
    for (let i = 0n; i < 1000n; i++) {
      const { positionAngleDeg } = fallbackOrientation(i, 0, 0.1 * Number(i));
      expect(positionAngleDeg).toBeGreaterThanOrEqual(0);
      expect(positionAngleDeg).toBeLessThan(180);
    }
  });

  it('handles objID 0n (synthetic / 2MRS / GLADE rows)', () => {
    const { axisRatio, positionAngleDeg } = fallbackOrientation(0n, 12.5, 30.4);
    expect(Number.isFinite(axisRatio)).toBe(true);
    expect(Number.isFinite(positionAngleDeg)).toBe(true);
  });

  it('does not throw when objID is undefined (oob index race during tier swap)', () => {
    // Reproduces the production crash:
    //   "Cannot mix BigInt and other types, use explicit conversions"
    // when `cloud.objIDs[oob]` returned undefined and reached hashSeed.
    // The defensive coerce-to-0n keeps the function total; the resulting
    // orientation is still derived deterministically from RA/Dec.
    const cast = fallbackOrientation as unknown as (
      objID: unknown,
      ra: number,
      dec: number,
    ) => { axisRatio: number; positionAngleDeg: number };
    const result = cast(undefined, 12.5, -3.2);
    expect(Number.isFinite(result.axisRatio)).toBe(true);
    expect(Number.isFinite(result.positionAngleDeg)).toBe(true);
    // And the result must agree with what an explicit 0n would produce —
    // proves the coercion path is the same one the function already
    // uses for unmatched rows.
    expect(result).toEqual(fallbackOrientation(0n, 12.5, -3.2));
  });
});
