import { describe, expect, it } from 'vitest';
import { focusAlphaMultiplier } from '../../../src/utils/structure/focusAlphaMultiplier';
import type { FocusUniformsValue } from '../../../src/@types/rendering/FocusUniformsValue';

const focusAt = (blend: number): FocusUniformsValue => ({
  center: [1, 0, 0],
  apparentRadiusMpc: 10,
  physicalRadiusMpc: 2,
  blend,
});

describe('focusAlphaMultiplier', () => {
  it('inside the physical radius the multiplier is 1', () => {
    expect(focusAlphaMultiplier([1.5, 0, 0], focusAt(1))).toBe(1);
  });

  it('far outside it is 0.08 at blend 1', () => {
    expect(focusAlphaMultiplier([100, 0, 0], focusAt(1))).toBeCloseTo(0.08, 12);
  });

  it('at blend 0 it is 1 everywhere', () => {
    expect(focusAlphaMultiplier([100, 0, 0], focusAt(0))).toBe(1);
    expect(focusAlphaMultiplier([5, 0, 0], focusAt(0))).toBe(1);
  });
});
