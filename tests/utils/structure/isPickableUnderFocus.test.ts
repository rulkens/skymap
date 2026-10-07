import { describe, expect, it } from 'vitest';
import { isPickableUnderFocus } from '../../../src/utils/structure/isPickableUnderFocus';
import type { FocusUniformsValue } from '../../../src/@types/rendering/FocusUniformsValue';

const focusAt = (blend: number): FocusUniformsValue => ({
  center: [1, 0, 0],
  apparentRadiusMpc: 10,
  physicalRadiusMpc: 2,
  blend,
});

describe('isPickableUnderFocus', () => {
  it('the sphere centre and its core are pickable; outside is not', () => {
    expect(isPickableUnderFocus([1, 0, 0], focusAt(1))).toBe(true);
    expect(isPickableUnderFocus([1.5, 0, 0], focusAt(1))).toBe(true);
    expect(isPickableUnderFocus([100, 0, 0], focusAt(1))).toBe(false);
  });

  it('at rest everything is pickable', () => {
    expect(isPickableUnderFocus([100, 0, 0], focusAt(0))).toBe(true);
  });
});
