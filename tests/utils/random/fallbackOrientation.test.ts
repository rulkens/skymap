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
});
