/** The population-scaler -> complex-count clamp the DIG veil uses. */
import { describe, expect, it } from 'vitest';
import { deriveComplexCount } from '../../../../../../src/layers/milkyWay/field/starFormation/utils/deriveComplexCount';

describe('deriveComplexCount', () => {
  it('scales population by the scaler and rounds to the nearest whole complex', () => {
    expect(deriveComplexCount(100, 0.5, 4, 1000)).toBe(50);
    expect(deriveComplexCount(10.4, 1, 4, 1000)).toBe(10);
  });

  it('clamps to maxCount / childrenPerComplex rather than growing past the component budget', () => {
    expect(deriveComplexCount(1000, 1, 4, 40)).toBe(10); // floor(40/4)
  });

  it('a zero or negative scaler/population yields zero, never a negative count', () => {
    expect(deriveComplexCount(100, 0, 4, 1000)).toBe(0);
    expect(deriveComplexCount(-5, 1, 4, 1000)).toBe(0);
  });
});
