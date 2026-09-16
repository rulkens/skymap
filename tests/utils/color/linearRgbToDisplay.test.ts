import { describe, expect, it } from 'vitest';
import { linearRgbToDisplay } from '../../../src/utils/color/linearRgbToDisplay';
import { hexToLinearRgb } from '../../../src/utils/color/hexToLinearRgb';

describe('linearRgbToDisplay', () => {
  it('holds the endpoints so display white stays white', () => {
    expect(linearRgbToDisplay([0, 0, 0])).toEqual([0, 0, 0]);
    for (const c of linearRgbToDisplay([1, 1, 1])) expect(c).toBeCloseTo(1, 12);
  });

  it('inverts hexToLinearRgb — the DebugPanel picker round-trip', () => {
    const [r, g, b] = linearRgbToDisplay(hexToLinearRgb('#8489DA'));
    expect(r).toBeCloseTo(0x84 / 255, 6);
    expect(g).toBeCloseTo(0x89 / 255, 6);
    expect(b).toBeCloseTo(0xda / 255, 6);
  });

  it('lifts mid-range linear well above its raw value', () => {
    // The whole reason the derived caption tints looked dark: a 0.3 albedo is
    // a 0.58 display grey, not a 0.3 one.
    expect(linearRgbToDisplay([0.3, 0.3, 0.3])[0]).toBeCloseTo(0.5841, 3);
  });

  it('clamps out-of-range channels instead of returning NaN', () => {
    const [r, g, b] = linearRgbToDisplay([-0.5, 2, 0]);
    expect(r).toBe(0);
    expect(g).toBeCloseTo(1, 12);
    expect(b).toBe(0);
  });
});
