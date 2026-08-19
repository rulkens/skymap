import { describe, expect, it } from 'vitest';
import { linearRgbToHex } from '../../../src/utils/color/linearRgbToHex';

describe('linearRgbToHex', () => {
  it('maps linear 0 and 1 to sRGB black and white', () => {
    expect(linearRgbToHex([0, 0, 0])).toBe('#000000');
    expect(linearRgbToHex([1, 1, 1])).toBe('#ffffff');
  });

  it('maps the linear 0.214 anchor to the sRGB mid-grey byte (~0x80)', () => {
    const hex = linearRgbToHex([0.214, 0.214, 0.214]);
    const byte = parseInt(hex.slice(1, 3), 16);
    expect(byte).toBeCloseTo(128, -1);
  });

  it('clamps out-of-range channels instead of throwing', () => {
    // Below 0 clamps to the black byte, above 1 clamps to the white byte —
    // the blue channel (0.5, in range) is unaffected, confirming clamping
    // is per-channel rather than an all-or-nothing reject.
    const clamped = linearRgbToHex([-1, 2, 0.5]);
    const inRange = linearRgbToHex([0, 0, 0.5]);
    expect(clamped).toBe(`#00ff${inRange.slice(5)}`);
  });
});
